import { isCalendarDate } from '../nutrition'
import { localDate } from '../model'

export const weightUnits = ['lb', 'kg'] as const
export type WeightUnit = typeof weightUnits[number]
export type Objective = 'lose' | 'maintain' | 'gain'

export interface WeightEntry {
  id: string
  date: string
  recordedKg: number
  importedAverageKg: number | null
  calculatedAverageKg: number | null
  useImportedTrend: boolean
  importedTrendStale: boolean
  originalUnit: WeightUnit
  origin: 'manual' | 'happy-scale'
  notes: string
  createdAt: string
  updatedAt: string
}

export interface WeightSettings {
  id: 'weight'
  unit: WeightUnit
  objective: Objective
  startDate: string | null
  startKg: number | null
  goal: { lowKg: number; highKg: number } | null
  commitmentKg: number | null
  incrementKg: number | null
  incrementUnit: WeightUnit
  tracking: 'recorded' | 'average'
  milestones: boolean
  predictions: boolean
}

export const defaultWeightSettings: WeightSettings = {
  id: 'weight', unit: 'lb', objective: 'maintain', startDate: null, startKg: null,
  goal: null, commitmentKg: null, incrementKg: null, incrementUnit: 'lb',
  tracking: 'average', milestones: false, predictions: false,
}

const poundsToKg = 0.45359237
export const toKg = (value: number, unit: WeightUnit) => unit === 'lb' ? value * poundsToKg : value
export const fromKg = (value: number, unit: WeightUnit) => unit === 'lb' ? value / poundsToKg : value
export const validWeight = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1e6
const maybeWeight = (value: unknown) => value === null || validWeight(value)
export const isWeightUnit = (value: unknown): value is WeightUnit => value === 'lb' || value === 'kg'

const dayMs = 86_400_000
export const dayNumber = (date: string) => Date.parse(date + 'T00:00:00Z') / dayMs
export const dayDifference = (earlier: string, later: string) => dayNumber(later) - dayNumber(earlier)

export function offsetDays(date: string, days: number) {
  const result = new Date((dayNumber(date) + days) * dayMs)
  return Number.isFinite(result.getTime()) ? result.toISOString().slice(0, 10) : ''
}

export function validWeightSettings(value: unknown): value is WeightSettings {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<WeightSettings>
  const goal = data.goal
  return data.id === 'weight' && isWeightUnit(data.unit) && isWeightUnit(data.incrementUnit)
    && (data.objective === 'lose' || data.objective === 'gain' || data.objective === 'maintain')
    && (data.startDate === null || isCalendarDate(data.startDate)) && maybeWeight(data.startKg)
    && ((data.startDate === null) === (data.startKg === null))
    && maybeWeight(data.commitmentKg) && maybeWeight(data.incrementKg)
    && (data.tracking === 'average' || data.tracking === 'recorded')
    && typeof data.milestones === 'boolean' && typeof data.predictions === 'boolean'
    && (goal === null || (!!goal && validWeight(goal.lowKg) && validWeight(goal.highKg) && goal.lowKg <= goal.highKg))
}

export function validWeightEntry(value: unknown): value is WeightEntry {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<WeightEntry>
  const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value
  return typeof data.id === 'string' && !!data.id.trim() && isCalendarDate(data.date) && validWeight(data.recordedKg)
    && maybeWeight(data.importedAverageKg) && maybeWeight(data.calculatedAverageKg)
    && typeof data.useImportedTrend === 'boolean' && typeof data.importedTrendStale === 'boolean'
    && (data.importedAverageKg !== null || (!data.useImportedTrend && !data.importedTrendStale))
    && isWeightUnit(data.originalUnit) && (data.origin === 'manual' || data.origin === 'happy-scale')
    && typeof data.notes === 'string' && timestamp(data.createdAt) && timestamp(data.updatedAt)
}

export function validWeighInDate(date: unknown, today = localDate()) {
  return isCalendarDate(date) && date <= today
}

export function formatWeight(kg: number, unit: WeightUnit) {
  return fromKg(kg, unit).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
