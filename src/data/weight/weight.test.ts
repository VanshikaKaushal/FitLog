import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../backup'
import { FitLogDatabase, workoutStore } from '../db'
import { newWorkout } from '../model'
import { saveLog } from '../nutritionStore'
import {
  activeAverage, milestoneJourney, milestonesFor, overallRate, predictMilestone, smoothEntries, trendChanges, weeklyRate,
} from './calculations'
import { parseWeightCsv, weightCsv } from './csv'
import { dayDifference, defaultWeightSettings, fromKg, offsetDays, toKg, type WeightEntry, type WeightSettings } from './model'
import {
  changeWeightUnit, deleteWeighIn, getWeightData, importWeights, recalculateStaleTrends, saveWeighIn,
  saveWeightSettings, WeighInConflict,
} from './store'

const today = '2026-11-25'
const stamp = '2026-11-25T00:00:00.000Z'
const csv = 'Date,Recorded,Moving Average\r\n2026-01-01,200,200\r\n2026-01-02,199.8,199.9\r\n2026-01-04,199.2,199.6'
const entry = (date: string, lb: number, average: number | null = null): WeightEntry => ({
  id: date, date, recordedKg: toKg(lb, 'lb'), importedAverageKg: average === null ? null : toKg(average, 'lb'),
  calculatedAverageKg: null, useImportedTrend: average !== null, importedTrendStale: false,
  origin: average === null ? 'manual' : 'happy-scale', originalUnit: 'lb', notes: '', createdAt: stamp, updatedAt: stamp,
})
const journey: WeightSettings = {
  ...defaultWeightSettings, objective: 'lose', startDate: '2026-01-01', startKg: toKg(219.1, 'lb'),
  goal: { lowKg: toKg(144, 'lb'), highKg: toKg(144, 'lb') }, incrementKg: toKg(5, 'lb'),
  milestones: true, tracking: 'recorded', predictions: true,
}

let db: FitLogDatabase
beforeEach(async () => {
  db = new FitLogDatabase('fitlog-weight-test-' + crypto.randomUUID())
  await db.open()
})
afterEach(async () => { await db.delete() })

describe('weigh-ins and units', () => {
  it('adds, edits, moves, deletes, and requires confirmation to replace a date', async () => {
    const draft = { date: '2026-02-01', weight: 180.4, unit: 'lb', notes: 'Synthetic' } as const
    await saveWeighIn(db, draft, { today })
    const first = (await getWeightData(db)).entries[0]
    await expect(saveWeighIn(db, { ...draft, weight: 180 }, { today })).rejects.toThrow(WeighInConflict)
    await saveWeighIn(db, { ...draft, weight: 180 }, { today, confirmedId: first.id })
    expect((await getWeightData(db)).entries[0].id).toBe(first.id)
    await saveWeighIn(db, { ...draft, date: '2026-02-02', notes: 'Updated' }, { today, editId: first.id })
    expect(await db.weightEntries.get(first.id)).toMatchObject({ date: '2026-02-02', notes: 'Updated' })
    await deleteWeighIn(db, first.id, false)
    expect(await db.weightEntries.count()).toBe(0)
  })

  it('uses calendar days over clock changes and rejects invalid or future dates', async () => {
    expect(dayDifference('2026-03-07', '2026-03-09')).toBe(2)
    expect(offsetDays('2024-02-28', 1)).toBe('2024-02-29')
    const draft = { weight: 90, unit: 'kg', notes: '' } as const
    for (const date of ['2026-02-31', '2026-11-26', '2026-03-08T11:30']) {
      await expect(saveWeighIn(db, { ...draft, date }, { today })).rejects.toThrow()
    }
  })

  it('converts all display values without updating the canonical data', async () => {
    expect(toKg(1, 'lb')).toBe(0.45359237)
    const weight = 184.456789
    expect(fromKg(toKg(weight, 'lb'), 'lb')).toBeCloseTo(weight, 12)
    await saveWeightSettings(db, journey)
    await saveWeighIn(db, { date: '2026-01-01', weight, unit: 'lb', notes: '' }, { today })
    const initial = await getWeightData(db)
    for (let i = 0; i < 5; i++) {
      await changeWeightUnit(db, 'kg')
      await changeWeightUnit(db, 'lb')
    }
    expect(await getWeightData(db)).toEqual(initial)
    expect(milestonesFor({ ...journey, unit: 'kg' })).toEqual(milestonesFor(journey))
  })
})

describe('Happy Scale CSV and smoothing', () => {
  it('reads BOM, whitespace, quoted fields, CRLF, duplicate dates, and absent averages', () => {
    const result = parseWeightCsv('\uFEFF  "Date" ,Recorded,"Moving Average"\r\n' +
      '"2025-01-01","200.01", ""\r\n2025-01-01,199.99,200\n2025-01-02,200.10,', 'lb')
    expect(result).toEqual({
      entries: [{ date: '2025-01-01', recorded: 199.99, average: 200 }, { date: '2025-01-02', recorded: 200.1, average: null }],
      rowCount: 3, duplicateDates: ['2025-01-01'], withAverage: 1,
    })
  })

  it('rejects wrong headers, malformed quoting, impossible dates, and invalid weights', () => {
    for (const invalid of ['Date,Weight\n2026-01-01,12', 'Date,Recorded,Moving Average\n2026-02-29,12,12',
      'Date,Recorded,Moving Average\n2026-02-01,-12,12', 'Date,Recorded,Moving Average\n2026-02-01,"12"abc,12',
      'Date,Recorded,Moving Average\n2026-02-01,12,"12', 'Date,Recorded,Moving Average\n2026-02-01,12,NaN']) {
      expect(() => parseWeightCsv(invalid, 'lb')).toThrow()
    }
  })

  it('deduplicates repeated imports and applies either conflict policy only to overlapping dates', async () => {
    const parsed = parseWeightCsv(csv, 'lb')
    expect(await importWeights(db, parsed.entries, 'lb', false, true, today)).toBe(3)
    expect(await importWeights(db, parsed.entries, 'lb', true, false, today)).toBe(0)
    const before = await getWeightData(db)
    expect(before.settings.startKg).toBe(toKg(200, 'lb'))
    const changed = [{ ...parsed.entries[0], recorded: 198 }]
    expect(await importWeights(db, changed, 'lb', false, false, today)).toBe(0)
    expect((await getWeightData(db)).entries[0]).toEqual(before.entries[0])
    expect(await importWeights(db, changed, 'lb', true, false, today)).toBe(1)
    const after = await getWeightData(db)
    expect(after.entries[0].id).toBe(before.entries[0].id)
    expect(after.entries[0].recordedKg).toBe(toKg(198, 'lb'))
    expect(after.entries[2].importedAverageKg).toBe(before.entries[2].importedAverageKg)
    const exported = parseWeightCsv(weightCsv(after.entries, 'kg'), 'kg')
    expect(exported.entries[2].average).toBe(before.entries[2].importedAverageKg)
  })

  it('anchors FitLog smoothing to the last imported average and accounts for elapsed days', async () => {
    const parsed = parseWeightCsv(csv, 'lb')
    await importWeights(db, parsed.entries, 'lb', false, false, today)
    await saveWeighIn(db, { date: '2026-01-11', weight: 198, unit: 'lb', notes: '' }, { today })
    const last = (await getWeightData(db)).entries.at(-1)!
    expect(fromKg(activeAverage(last), 'lb')).toBeCloseTo((199.6 + 198) / 2)
    expect(last.useImportedTrend).toBe(false)
  })

  it('flags historical edits, recalculates on explicit request, and preserves original values', async () => {
    await importWeights(db, parseWeightCsv(csv, 'lb').entries, 'lb', false, false, today)
    const first = (await getWeightData(db)).entries[0]
    await saveWeighIn(db, { date: first.date, weight: 210, unit: 'lb', notes: 'Edited' }, { today, editId: first.id })
    const flagged = (await getWeightData(db)).entries
    expect(flagged.every(row => row.importedTrendStale)).toBe(true)
    expect(activeAverage(flagged[0])).toBe(first.importedAverageKg)
    await recalculateStaleTrends(db)
    const result = (await getWeightData(db)).entries
    expect(result.every(row => !row.useImportedTrend)).toBe(true)
    expect(result[0].importedAverageKg).toBe(first.importedAverageKg)
    expect(result[0].calculatedAverageKg).toBe(toKg(210, 'lb'))
    expect(result[2].calculatedAverageKg).not.toBe(flagged[2].calculatedAverageKg)
  })
})

describe('trends, milestones, and forecasts', () => {
  it('calculates weekly regression over calendar days with a minimum history', () => {
    const entries = [entry('2026-01-01', 200, 200), entry('2026-01-04', 197, 197), entry('2026-01-09', 192, 192)]
    expect(fromKg(weeklyRate(entries, '2026-01-09')!, 'lb')).toBeCloseTo(-7)
    expect(weeklyRate(entries.slice(1), '2026-01-09')).toBeNull()
    expect(weeklyRate(entries, '2026-04-09')).toBeNull()
    const steady = smoothEntries(entries.map(row => ({ ...row, recordedKg: 70, useImportedTrend: false })))
    expect(weeklyRate(steady, '2026-01-09')).toBe(0)
  })

  it('interpolates bracketed trend boundaries and leaves uncovered periods unavailable', () => {
    const entries = [entry('2026-01-01', 200, 190), entry('2026-01-11', 190, 183)]
    expect(fromKg(trendChanges(entries, 'recorded')[0].change!, 'lb')).toBeCloseTo(-7)
    expect(fromKg(trendChanges(entries, 'average')[0].change!, 'lb')).toBeCloseTo(-4.9)
    expect(trendChanges(entries, 'recorded')[1].change).toBeNull()
    expect(trendChanges(entries, 'recorded')[2].change).toBeNull()
    expect(fromKg(trendChanges(entries, 'recorded')[3].change!, 'lb')).toBeCloseTo(-10)
  })

  it('generates round milestone boundaries, partial first and final segments, and range entry boundaries', () => {
    const pounds = milestonesFor(journey).map(value => Math.round(fromKg(value, 'lb')))
    expect(pounds.slice(0, 7)).toEqual([215, 210, 205, 200, 195, 190, 185])
    expect(pounds.at(-2)).toBe(145)
    expect(pounds.at(-1)).toBe(144)
    const range = { lowKg: toKg(144, 'lb'), highKg: toKg(148, 'lb') }
    expect(milestonesFor({ ...journey, goal: range }).at(-1)).toBe(range.highKg)
    const gain = { ...journey, objective: 'gain' as const, goal: range, startKg: toKg(139.8, 'lb') }
    expect(milestonesFor(gain).map(value => Math.round(fromKg(value, 'lb')))).toEqual([140, 144])
  })

  it('detects each historical achievement once and computes 72% of the active segment', () => {
    const records = [entry('2025-12-25', 140), entry('2026-01-01', 219.1), entry('2026-02-01', 190),
      entry('2026-02-10', 194), entry('2026-02-15', 186.4)]
    const result = milestoneJourney(records, journey)
    expect(result.achievements).toHaveLength(6)
    expect(new Set(result.achievements.map(item => item.date))).toEqual(new Set(['2026-02-01']))
    expect(fromKg(result.next!, 'lb')).toBeCloseTo(185)
    expect(result.fraction).toBeCloseTo(0.72)
    expect(fromKg(result.remaining!, 'lb')).toBeCloseTo(1.4)
    const final = milestoneJourney([...records, entry('2026-03-01', 144), entry('2026-03-02', 150)], journey)
    expect(final.complete).toBe(true)
    expect(final.next).toBeNull()
  })

  it('projects from the last weigh-in only with a matching, nonzero rate and a next milestone', () => {
    const last = entry('2026-02-15', 187)
    const next = toKg(185, 'lb')
    expect(predictMilestone(last, journey, next, toKg(-2, 'lb'), '2026-02-16')).toEqual({
      date: '2026-02-22', daysFromToday: 6, basedOn: '2026-02-15',
    })
    for (const rate of [null, 0, toKg(2, 'lb'), NaN]) expect(predictMilestone(last, journey, next, rate, today)).toBeNull()
    expect(predictMilestone(last, journey, null, toKg(-2, 'lb'), today)).toBeNull()
    expect(fromKg(overallRate(journey, last)!, 'lb')).toBeCloseTo((187 - 219.1) * 7 / 45)
  })
})

describe('database migration and backup compatibility', () => {
  it('upgrades the existing v3 schema with workouts, food logs, and settings intact', async () => {
    const name = 'fitlog-weight-upgrade-' + crypto.randomUUID()
    const old = new Dexie(name)
    old.version(3).stores({ workouts: workoutStore, exercises: 'id,name', settings: 'key', foods: 'id,name', foodLogs: 'id,date,[date+meal],foodId' })
    const workout = newWorkout('Pull', '2026-01-01')
    const setting = { key: 'lastExport', value: stamp }
    const nutrition = { id: 'synthetic', date: '2026-01-01', meal: 'Breakfast', name: 'Synthetic food' }
    await old.table('workouts').add(workout)
    await old.table('foodLogs').add(nutrition)
    await old.table('foods').add({ id: 'synthetic-food', name: 'Synthetic food' })
    await old.table('settings').add(setting)
    old.close()
    const upgraded = new FitLogDatabase(name)
    try {
      expect(await upgraded.workouts.get(workout.id)).toEqual(workout)
      expect(await upgraded.foodLogs.get(nutrition.id)).toEqual(nutrition)
      expect(await upgraded.foods.count()).toBe(1)
      expect(await upgraded.settings.get('lastExport')).toEqual(setting)
      expect(await upgraded.weightEntries.count()).toBe(0)
    } finally { await upgraded.delete() }
  })

  it('restores all data atomically, and older backups retain categories they omit', async () => {
    await db.workouts.add(newWorkout('Push', '2026-01-10'))
    await saveLog(db, { date: '2026-01-10', meal: 'Lunch', foodId: null, name: 'Synthetic food',
      quantity: null, unit: null, description: '', nutrition: { calories: 20, carbs: null, protein: null, fat: 0, fiber: null },
      reference: null, source: '', verified: false, notes: '' })
    await saveWeightSettings(db, journey)
    await importWeights(db, parseWeightCsv(csv, 'lb').entries, 'lb', false, false, today)
    const backup = await createBackup(db)
    const { weightEntries, weightSettings, ...older } = backup
    const v2 = { ...older, version: 2 }
    await restoreBackup(db, v2)
    expect(await db.weightEntries.count()).toBe(3)
    expect(await db.weightSettings.get('weight')).toEqual(weightSettings)
    await restoreBackup(db, {
      format: older.format, version: 1, exportedAt: older.exportedAt,
      workouts: older.workouts, exercises: older.exercises, settings: older.settings,
      counts: { workouts: older.counts.workouts, exercises: older.counts.exercises, sets: older.counts.sets },
    })
    expect(await db.weightEntries.toArray()).toEqual(weightEntries)
    expect(await db.foodLogs.count()).toBe(1)
    await expect(restoreBackup(db, { ...backup, weightEntries: [weightEntries[0], { ...weightEntries[0], id: 'duplicate-date' }],
      counts: { ...backup.counts, weightEntries: 2 } })).rejects.toThrow('invalid')
    expect(await db.weightEntries.count()).toBe(3)
    const target = new FitLogDatabase('fitlog-weight-restore-' + crypto.randomUUID())
    try {
      await restoreBackup(target, JSON.parse(JSON.stringify(backup)))
      expect(await target.weightEntries.toArray()).toEqual(weightEntries)
      expect(await target.weightSettings.get('weight')).toEqual(weightSettings)
      expect(await target.workouts.count()).toBe(1)
      expect(await target.foodLogs.count()).toBe(1)
    } finally { await target.delete() }
  })
})
