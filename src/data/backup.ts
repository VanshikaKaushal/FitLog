import { type FitLogDatabase, type Setting } from './db'
import { kinds, localDate, type Kind, type Exercise, type Workout } from './model'

type BackupData = { workouts: Workout[]; exercises: Exercise[]; settings: Setting[] }

export interface Backup extends BackupData {
  format: 'fitlog-backup'
  version: 1
  exportedAt: string
  counts: { workouts: number; exercises: number; sets: number }
}

function counts(data: BackupData) {
  return {
    workouts: data.workouts.length,
    exercises: data.exercises.length,
    sets: data.workouts.reduce((total, workout) =>
      total + workout.exercises.reduce((sum, item) => sum + item.sets.length, 0), 0),
  }
}

export async function createBackup(db: FitLogDatabase): Promise<Backup> {
  return db.transaction('rw', db.workouts, db.exercises, db.settings, async () => {
    const exportedAt = new Date().toISOString()
    await db.settings.put({ key: 'lastExport', value: exportedAt })
    const data = {
      workouts: await db.workouts.toArray(),
      exercises: await db.exercises.toArray(),
      settings: await db.settings.toArray(),
    }
    return { format: 'fitlog-backup', version: 1, exportedAt, ...data, counts: counts(data) }
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
  if (value.version !== 1) throw new Error('This backup version is unsupported.')
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
  const backup = value as unknown as Backup
  const actual = counts(backup)
  if (Object.entries(actual).some(([key, count]) => backup.counts[key as keyof typeof actual] !== count)) throw invalid()
  return backup
}

export async function restoreBackup(db: FitLogDatabase, input: unknown) {
  const backup = validateBackup(input)
  await db.transaction('rw', db.exercises, db.workouts, db.settings, async () => {
    const localExport = await db.settings.get('lastExport')
    await db.workouts.clear()
    await db.exercises.clear()
    await db.settings.clear()
    await db.exercises.bulkAdd(backup.exercises)
    await db.workouts.bulkAdd(backup.workouts)
    await db.settings.bulkAdd(backup.settings)
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
