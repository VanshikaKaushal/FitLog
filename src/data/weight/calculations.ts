import {
  dayDifference, dayNumber, fromKg, offsetDays, toKg, type WeightEntry, type WeightSettings,
} from './model'
import { isCalendarDate } from '../nutrition'

export const smoothingHalfLifeDays = 7
const epsilon = 1e-8
export const maxMilestones = 200

export function activeAverage(entry: WeightEntry) {
  return (entry.useImportedTrend ? entry.importedAverageKg : entry.calculatedAverageKg) ?? entry.recordedKg
}

export function trackingWeight(entry: WeightEntry, method: WeightSettings['tracking']) {
  return method === 'average' ? activeAverage(entry) : entry.recordedKg
}

export function smoothEntries(entries: WeightEntry[]) {
  let previous: WeightEntry | undefined
  return entries.slice().sort((a, b) => a.date.localeCompare(b.date)).map(entry => {
    const elapsed = previous ? dayDifference(previous.date, entry.date) : 0
    const retention = 2 ** (-elapsed / smoothingHalfLifeDays)
    const calculatedAverageKg = previous
      ? activeAverage(previous) * retention + entry.recordedKg * (1 - retention)
      : entry.recordedKg
    const next = { ...entry, calculatedAverageKg }
    previous = next
    return next
  })
}

export function weeklyRate(entries: WeightEntry[], date: string) {
  const end = dayNumber(date)
  // The log has one entry per day and is sorted oldest first.
  let left = 0
  let right = entries.length
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (dayNumber(entries[middle].date) < end - 28) left = middle + 1
    else right = middle
  }
  const points: { x: number; y: number }[] = []
  for (let index = left; index < entries.length; index++) {
    const entry = entries[index]
    const x = dayNumber(entry.date) - end
    if (x > 0) break
    points.push({ x, y: activeAverage(entry) })
  }
  if (points.length < 3 || points[points.length - 1].x - points[0].x < 7) return null
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length
  let covariance = 0
  let variance = 0
  for (const { x, y } of points) {
    covariance += (x - meanX) * (y - meanY)
    variance += (x - meanX) ** 2
  }
  const rate = (covariance / variance) * 7
  return Math.abs(rate) < epsilon ? 0 : rate
}

export function trendChanges(entries: WeightEntry[], method: WeightSettings['tracking']) {
  const latest = entries.at(-1)
  const first = entries[0]
  const weight = (entry: WeightEntry) => trackingWeight(entry, method)
  return [7, 30, 90, null].map(days => {
    if (!latest || !first || entries.length < 2) return { days, change: null }
    if (days === null) return { days, change: weight(latest) - weight(first) }
    const boundary = dayNumber(latest.date) - days
    const index = entries.findIndex(entry => dayNumber(entry.date) >= boundary)
    if (index < 0) return { days, change: null }
    const after = entries[index]
    const afterDay = dayNumber(after.date)
    if (afterDay === boundary) return { days, change: weight(latest) - weight(after) }
    const before = entries[index - 1]
    if (!before) return { days, change: null }
    const beforeDay = dayNumber(before.date)
    const proportion = (boundary - beforeDay) / (afterDay - beforeDay)
    return { days, change: weight(latest) - (weight(before) + (weight(after) - weight(before)) * proportion) }
  })
}

export function milestonesFor(settings: WeightSettings): number[] {
  if (!settings.milestones || settings.objective === 'maintain' || !settings.goal || settings.startKg === null
      || settings.incrementKg === null || settings.startDate === null) return []
  const direction = settings.objective === 'lose' ? -1 : 1
  const goal = direction < 0 ? settings.goal.highKg : settings.goal.lowKg
  if ((goal - settings.startKg) * direction <= epsilon) return []
  const start = settings.startKg / settings.incrementKg
  const firstIndex = direction < 0 ? Math.ceil(start - epsilon) - 1 : Math.floor(start + epsilon) + 1
  const milestones: number[] = []
  for (let index = 0; index < maxMilestones; index++) {
    const weight = (firstIndex + index * direction) * settings.incrementKg
    if ((goal - weight) * direction <= epsilon) return [...milestones, goal]
    milestones.push(weight)
  }
  return []
}

export function milestoneJourney(entries: WeightEntry[], settings: WeightSettings) {
  const boundaries = milestonesFor(settings)
  const direction = settings.objective === 'lose' ? -1 : 1
  const achievements: { weight: number; date: string }[] = []
  for (const entry of entries) {
    if (settings.startDate && entry.date < settings.startDate) continue
    const current = trackingWeight(entry, settings.tracking)
    while (achievements.length < boundaries.length
        && (current - boundaries[achievements.length]) * direction >= -epsilon) {
      achievements.push({ weight: boundaries[achievements.length], date: entry.date })
    }
  }
  const next = boundaries[achievements.length] ?? null
  const previous = achievements.at(-1)?.weight ?? settings.startKg
  const latest = entries.at(-1)
  const current = latest && (!settings.startDate || latest.date >= settings.startDate)
    ? trackingWeight(latest, settings.tracking) : null
  const complete = boundaries.length > 0 && next === null
  const fraction = complete ? 1 : next === null || previous === null || current === null ? 0
    : Math.max(0, Math.min(1, (current - previous) / (next - previous)))
  return { boundaries, achievements, next, fraction, complete, remaining: next === null || current === null ? null : Math.abs(next - current) }
}

export function overallRate(settings: WeightSettings, entry?: WeightEntry) {
  if (!settings.startDate || settings.startKg === null || !entry) return null
  const elapsed = dayDifference(settings.startDate, entry.date)
  return elapsed > 0 ? (trackingWeight(entry, settings.tracking) - settings.startKg) * 7 / elapsed : null
}

export function predictMilestone(latest: WeightEntry | undefined, settings: WeightSettings, next: number | null,
    rate: number | null, today: string) {
  if (!latest || next === null || rate === null || !Number.isFinite(rate) || Math.abs(rate) < epsilon
      || (settings.startDate && latest.date < settings.startDate)) return null
  const delta = next - trackingWeight(latest, settings.tracking)
  const days = Math.ceil(delta / rate * 7)
  if (!Number.isFinite(days) || days <= 0 || days > 36525) return null
  const date = offsetDays(latest.date, days)
  if (!isCalendarDate(date)) return null
  const daysFromToday = dayDifference(today, date)
  return { date, daysFromToday, basedOn: latest.date }
}

export function showChange(kg: number | null, unit: WeightSettings['unit'], weekly = false) {
  if (kg === null) return 'Unavailable'
  const change = fromKg(kg, unit)
  const value = Math.abs(change).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const arrow = Math.abs(change) < 0.05 ? '→' : change < 0 ? '↓' : '↑'
  return arrow + ' ' + value + ' ' + unit + (weekly ? '/wk' : '')
}

export function directionLabel(kg: number, unit: WeightSettings['unit']) {
  return Math.abs(kg) < toKg(0.05, unit) ? 'No change' : kg < 0 ? 'Loss' : 'Gain'
}
