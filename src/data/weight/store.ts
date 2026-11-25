import type { FitLogDatabase } from '../db'
import { localDate } from '../model'
import { smoothEntries } from './calculations'
import { type WeightCsvRow } from './csv'
import {
  defaultWeightSettings, toKg, validWeight, validWeighInDate, validWeightSettings,
  type WeightEntry, type WeightSettings, type WeightUnit,
} from './model'

export function getWeightData(db: FitLogDatabase) {
  return db.transaction('r', db.weightEntries, db.weightSettings, async () => ({
    entries: await db.weightEntries.orderBy('date').toArray(),
    settings: await db.weightSettings.get('weight') ?? defaultWeightSettings,
  }))
}

export async function saveWeightSettings(db: FitLogDatabase, settings: WeightSettings) {
  if (!validWeightSettings(settings)) throw new Error('Check the starting point, goal, and rate values.')
  await db.weightSettings.put(settings)
}

export function changeWeightUnit(db: FitLogDatabase, unit: WeightUnit) {
  return db.transaction('rw', db.weightSettings, async () => {
    const settings = await db.weightSettings.get('weight') ?? defaultWeightSettings
    await saveWeightSettings(db, { ...settings, unit })
  })
}

async function updateTrends(db: FitLogDatabase, staleFrom?: string, recalculate = false) {
  const original = await db.weightEntries.orderBy('date').toArray()
  const entries = original.map(entry => {
    if (!staleFrom || entry.date < staleFrom || entry.importedAverageKg === null) return entry
    return { ...entry, importedTrendStale: true, useImportedTrend: recalculate ? false : entry.useImportedTrend }
  })
  const changed = smoothEntries(entries).filter((entry, i) =>
    entry.calculatedAverageKg !== original[i].calculatedAverageKg
    || entry.importedTrendStale !== original[i].importedTrendStale
    || entry.useImportedTrend !== original[i].useImportedTrend)
  await db.weightEntries.bulkPut(changed)
}

const sameWeight = (a: number, b: number) => Math.abs(a - b) <= Number.EPSILON * Math.max(a, b) * 4

interface WeightDraft { date: string; weight: number; unit: WeightUnit; notes: string }

export class WeighInConflict extends Error {
  readonly entry: WeightEntry
  constructor(entry: WeightEntry) {
    super('A weigh-in already exists for that date.')
    this.entry = entry
  }
}

export async function saveWeighIn(db: FitLogDatabase, draft: WeightDraft, options: {
  editId?: string; confirmedId?: string; recalculate?: boolean; today?: string
} = {}) {
  const { date, unit, notes } = draft
  const recordedKg = toKg(draft.weight, unit)
  if (!validWeighInDate(date, options.today) || !validWeight(recordedKg)) {
    throw new Error('Enter a positive weight and a valid date through today.')
  }
  return db.transaction('rw', db.weightEntries, db.weightSettings, async () => {
    const existing = await db.weightEntries.where('date').equals(date).first()
    const editing = options.editId ? await db.weightEntries.get(options.editId) : undefined
    if (options.editId && !editing) throw new Error('This entry was deleted. Open the logbook to add a new entry.')
    if (existing && existing.id !== editing?.id && (editing || existing.id !== options.confirmedId)) {
      throw new WeighInConflict(existing)
    }
    const previous = editing ?? existing
    const now = new Date().toISOString()
    const entry: WeightEntry = {
      id: previous?.id ?? crypto.randomUUID(), date, recordedKg: previous && sameWeight(previous.recordedKg, recordedKg) ? previous.recordedKg : recordedKg,
      notes, originalUnit: previous?.originalUnit ?? unit,
      importedAverageKg: previous?.importedAverageKg ?? null,
      calculatedAverageKg: previous?.calculatedAverageKg ?? null,
      useImportedTrend: previous?.useImportedTrend ?? false,
      importedTrendStale: previous?.importedTrendStale ?? false,
      origin: previous?.origin ?? 'manual', createdAt: previous?.createdAt ?? now, updatedAt: now,
    }
    const changed = !previous || previous.recordedKg !== entry.recordedKg || previous.date !== date
    const affected = previous && previous.date < date ? previous.date : date
    await db.weightEntries.put(entry)
    await updateTrends(db, changed ? affected : undefined, options.recalculate)
    const settings = await db.weightSettings.get('weight') ?? defaultWeightSettings
    if (settings.unit !== unit) await saveWeightSettings(db, { ...settings, unit })
  })
}

export function deleteWeighIn(db: FitLogDatabase, id: string, recalculate: boolean) {
  return db.transaction('rw', db.weightEntries, async () => {
    const entry = await db.weightEntries.get(id)
    if (!entry) return
    await db.weightEntries.delete(id)
    await updateTrends(db, entry.date, recalculate)
  })
}

export function recalculateStaleTrends(db: FitLogDatabase) {
  return db.transaction('rw', db.weightEntries, async () => {
    const entries = await db.weightEntries.orderBy('date').toArray()
    const updated = entries.filter(entry => entry.importedTrendStale && entry.useImportedTrend)
    await db.weightEntries.bulkPut(updated.map(entry => ({ ...entry, useImportedTrend: false })))
    await updateTrends(db)
  })
}

export function csvMatches(existing: WeightEntry, row: WeightCsvRow, unit: WeightUnit) {
  const average = row.average === null ? null : toKg(row.average, unit)
  return sameWeight(existing.recordedKg, toKg(row.recorded, unit)) && (
    existing.importedAverageKg === average
    || (existing.importedAverageKg !== null && average !== null && sameWeight(existing.importedAverageKg, average))
  )
}

export async function importWeights(db: FitLogDatabase, rows: WeightCsvRow[], unit: WeightUnit, replace: boolean,
    useEarliest: boolean, today = localDate()) {
  if (!rows.length || new Set(rows.map(row => row.date)).size !== rows.length
      || rows.some(row => !validWeighInDate(row.date, today) || !validWeight(toKg(row.recorded, unit))
        || (row.average !== null && !validWeight(toKg(row.average, unit))))) {
    throw new Error('The import contains an invalid date or weight. Check the CSV before trying again.')
  }
  return db.transaction('rw', db.weightEntries, db.weightSettings, async () => {
    const existing = new Map((await db.weightEntries.toArray()).map(entry => [entry.date, entry]))
    const now = new Date().toISOString()
    const changes: WeightEntry[] = []
    for (const row of rows) {
      const previous = existing.get(row.date)
      if (previous && (!replace || csvMatches(previous, row, unit))) continue
      changes.push({
        id: previous?.id ?? crypto.randomUUID(), date: row.date, recordedKg: toKg(row.recorded, unit),
        importedAverageKg: row.average === null ? null : toKg(row.average, unit),
        calculatedAverageKg: previous?.calculatedAverageKg ?? null,
        useImportedTrend: row.average !== null, importedTrendStale: false,
        originalUnit: unit, origin: 'happy-scale', notes: previous?.notes ?? '',
        createdAt: previous?.createdAt ?? now, updatedAt: now,
      })
    }
    await db.weightEntries.bulkPut(changes)
    if (changes.length) await updateTrends(db)
    if (useEarliest) {
      const earliest = await db.weightEntries.orderBy('date').first()
      const settings = await db.weightSettings.get('weight') ?? defaultWeightSettings
      if (earliest) await saveWeightSettings(db, { ...settings, startDate: earliest.date, startKg: earliest.recordedKg })
    }
    return changes.length
  })
}
