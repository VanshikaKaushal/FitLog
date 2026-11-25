import { type FitLogDatabase, type Setting } from './db'
import { kinds, localDate, type Kind, type Exercise, type Workout } from './model'

import {
  isCalendarDate, isQuantity, meals, units, validNutrition,
  type Food, type FoodLogEntry, type Meal, type Unit,
} from './nutrition'

import { validWeightEntry, validWeightSettings, type WeightEntry, type WeightSettings } from './weight/model'

type BackupData = { workouts: Workout[]; exercises: Exercise[]; settings: Setting[] }

interface BackupHeader extends BackupData {
  format: 'fitlog-backup'
  exportedAt: string
}

type WorkoutCounts = { workouts: number; exercises: number; sets: number }

interface WorkoutBackup extends BackupHeader {
  version: 1
  counts: WorkoutCounts
}

interface NutritionBackupData extends BackupHeader {
  foods: Food[]
  foodLogs: FoodLogEntry[]
  counts: WorkoutCounts & { foods: number; foodLogs: number }
}

interface NutritionBackup extends NutritionBackupData {
  version: 2
}

interface FullBackup extends NutritionBackupData {
  version: 3
  weightEntries: WeightEntry[]
  weightSettings: WeightSettings | null
  counts: NutritionBackupData['counts'] & { weightEntries: number }
}

export type Backup = WorkoutBackup | NutritionBackup | FullBackup

function counts(data: BackupData) {
  return {
    workouts: data.workouts.length,
    exercises: data.exercises.length,
    sets: data.workouts.reduce((total, workout) =>
      total + workout.exercises.reduce((sum, item) => sum + item.sets.length, 0), 0),
  }
}

export async function createBackup(db: FitLogDatabase): Promise<FullBackup> {
  return db.transaction('rw', [db.workouts, db.exercises, db.settings, db.foods, db.foodLogs, db.weightEntries, db.weightSettings], async () => {
    const exportedAt = new Date().toISOString()
    await db.settings.put({ key: 'lastExport', value: exportedAt })
    const data = {
      workouts: await db.workouts.toArray(),
      exercises: await db.exercises.toArray(),
      settings: await db.settings.toArray(),
    }
    const foods = await db.foods.toArray()
    const foodLogs = await db.foodLogs.toArray()
    const weightEntries = await db.weightEntries.toArray()
    const weightSettings = await db.weightSettings.get('weight') ?? null
    return {
      format: 'fitlog-backup', version: 3, exportedAt, ...data, foods, foodLogs, weightEntries, weightSettings,
      counts: { ...counts(data), foods: foods.length, foodLogs: foodLogs.length, weightEntries: weightEntries.length },
    }
  })
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === 'string'
const nonempty = (value: unknown): value is string => string(value) && !!value.trim()
const load = (value: unknown) => value === null || (typeof value === 'number' &&
  Number.isFinite(value) && value >= 0 && value <= 1000000)
const timestamp = (value: unknown) => string(value) && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value
const calendar = (value: unknown) => string(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const mode = (value: unknown) => value === 'weight' || value === 'bodyweight' || value === 'assisted'

function unique(value: unknown, registry: Set<string>) {
  if (!nonempty(value) || registry.has(value)) return false
  registry.add(value)
  return true
}

export function validateBackup(value: unknown): Backup {
  const invalid = () => { throw new Error('This backup contains missing, invalid, or duplicate records.') }
  if (!object(value) || value.format !== 'fitlog-backup') throw new Error('Choose a FitLog JSON backup.')
  if (value.version !== 1 && value.version !== 2 && value.version !== 3) throw new Error('This backup version is unsupported.')
  if (!timestamp(value.exportedAt) || !object(value.counts) ||
    !Array.isArray(value.workouts) || !Array.isArray(value.exercises) || !Array.isArray(value.settings)) {
    throw invalid()
  }

  const exercises = new Map<string, 'seconds' | 'reps'>()
  const exerciseIds = new Set<string>()
  const workoutIds = new Set<string>()
  const itemIds = new Set<string>()
  const setIds = new Set<string>()
  const settingKeys = new Set<string>()
  for (const exercise of value.exercises) {
    if (!object(exercise) || !nonempty(exercise.id) || !unique(exercise.id, exerciseIds) ||
      !nonempty(exercise.name) || !string(exercise.equipment) || !mode(exercise.mode) ||
      (exercise.measure !== 'reps' && exercise.measure !== 'seconds')) throw invalid()
    exercises.set(exercise.id, exercise.measure)
  }
  for (const workout of value.workouts) {
    if (!object(workout) || !unique(workout.id, workoutIds) || !string(workout.name) ||
      !kinds.includes(workout.kind as Kind) ||
      !calendar(workout.date) || !timestamp(workout.createdAt) || !string(workout.notes) ||
      !(workout.completedAt === null || timestamp(workout.completedAt)) || !Array.isArray(workout.exercises)) {
      throw invalid()
    }
    for (const item of workout.exercises) {
      if (!object(item) || !unique(item.id, itemIds) || !string(item.exerciseId) || !exercises.has(item.exerciseId) ||
        !string(item.notes) || !Array.isArray(item.sets)) throw invalid()
      for (const set of item.sets) {
        if (!object(set) || !unique(set.id, setIds) || !load(set.amount) || !load(set.weight) ||
          !load(set.assistance) || !mode(set.mode) || !string(set.notes) ||
          (set.unit !== 'lb' && set.unit !== 'kg') ||
          !(set.scope === 'total' || set.scope === 'per-side' || set.scope === 'unknown') ||
          (exercises.get(item.exerciseId) === 'reps' && set.amount !== null && !Number.isInteger(set.amount)) ||
          (set.plates !== undefined && (!object(set.plates) || !load(set.plates.base) || !load(set.plates.added)))) {
          throw invalid()
        }
      }
    }
  }
  for (const setting of value.settings) {
    if (!object(setting) || setting.key !== 'lastExport' || !unique(setting.key, settingKeys) ||
      !timestamp(setting.value)) throw invalid()
  }
  const workoutCounts = counts(value as unknown as BackupData)
  const reported = value.counts
  if (Object.entries(workoutCounts).some(([key, count]) => reported[key] !== count)) throw invalid()

  if (value.version >= 2) {
    if (!Array.isArray(value.foods) || !Array.isArray(value.foodLogs)
        || reported.foods !== value.foods.length || reported.foodLogs !== value.foodLogs.length) throw invalid()
    const foodIds = new Set<string>()
    const logIds = new Set<string>()
    for (const food of value.foods) {
      if (!object(food) || !unique(food.id, foodIds) || !nonempty(food.name) || !string(food.brand)
          || !string(food.category) || !nutritionMetadata(food) || !serving(food.serving)
          || typeof food.favorite !== 'boolean') throw invalid()
    }
    for (const entry of value.foodLogs) {
      if (!object(entry) || !unique(entry.id, logIds) || !nonempty(entry.name) || !isCalendarDate(entry.date)
          || !meals.includes(entry.meal as Meal) || !(entry.foodId === null || nonempty(entry.foodId))
          || !string(entry.description) || !nutritionMetadata(entry) || !validNutrition(entry.nutrition)
          || !(entry.quantity === null || isQuantity(entry.quantity))
          || !(entry.unit === null || (units.includes(entry.unit as Unit) && isQuantity(entry.quantity)))
          || !(entry.reference === null || (serving(entry.reference) && isQuantity(entry.quantity)
            && entry.unit === entry.reference.unit))
          || !timestamp(entry.createdAt) || !timestamp(entry.updatedAt)) throw invalid()
    }
  }
  if (value.version === 3) {
    if (!Array.isArray(value.weightEntries) || reported.weightEntries !== value.weightEntries.length
        || !(value.weightSettings === null || validWeightSettings(value.weightSettings))) throw invalid()
    const ids = new Set<string>()
    const dates = new Set<string>()
    for (const entry of value.weightEntries) {
      if (!validWeightEntry(entry) || !unique(entry.id, ids) || !unique(entry.date, dates)) throw invalid()
    }
  }
  return value as unknown as Backup
}

function nutritionMetadata(value: Record<string, unknown>) {
  return string(value.source) && string(value.notes) && typeof value.verified === 'boolean'
}

function serving(value: unknown): value is Record<string, unknown> {
  return object(value) && isQuantity(value.quantity) && units.includes(value.unit as Unit)
    && validNutrition(value.nutrition)
}

export async function restoreBackup(db: FitLogDatabase, input: unknown) {
  const backup = validateBackup(input)
  await db.transaction('rw', [db.exercises, db.workouts, db.settings, db.foods, db.foodLogs, db.weightEntries, db.weightSettings], async () => {
    const localExport = await db.settings.get('lastExport')
    await db.workouts.clear()
    await db.exercises.clear()
    await db.settings.clear()
    await db.exercises.bulkAdd(backup.exercises)
    await db.workouts.bulkAdd(backup.workouts)
    await db.settings.bulkAdd(backup.settings)
    if (backup.version !== 1) {
      await db.foodLogs.clear()
      await db.foods.clear()
      await db.foods.bulkAdd(backup.foods)
      await db.foodLogs.bulkAdd(backup.foodLogs)
    }
    if (backup.version === 3) {
      await db.weightEntries.clear()
      await db.weightSettings.clear()
      await db.weightEntries.bulkAdd(backup.weightEntries)
      if (backup.weightSettings) await db.weightSettings.add(backup.weightSettings)
    }
    const restoredExport = backup.settings.find(setting => setting.key === 'lastExport')
    if (localExport && (!restoredExport || localExport.value > restoredExport.value)) await db.settings.put(localExport)
  })
}

export function backupFile(backup: Backup) {
  return new File([JSON.stringify(backup, null, 2)], 'fitlog-backup-' + localDate() + '.json',
    { type: 'application/json' })
}

export function downloadBackup(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.download = file.name
  link.href = url
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
