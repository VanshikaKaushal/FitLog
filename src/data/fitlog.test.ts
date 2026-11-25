import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup, validateBackup } from './backup'
import { FitLogDatabase, workoutStore } from './db'
import { describeSet, exerciseHistory, kilograms, records } from './history'
import {
  copySets, duplicateWorkout, localDate, newSet, newWorkout, starterExercises, type SetEntry, type Workout,
} from './model'

const cable = starterExercises.find(exercise => exercise.name === 'Tricep Pushdown')!
const assisted = starterExercises.find(exercise => exercise.name === 'Assisted Pull-up')!
const sets = [[50, 15], [55, 13], [50, 15]].map(([weight, amount]) => ({ ...newSet(cable), weight, amount }))

function fixture(date = '2026-11-23', entries = copySets(sets)): Workout {
  return {
    ...newWorkout('Push', date),
    exercises: [{ id: crypto.randomUUID(), exerciseId: cable.id, notes: '', sets: entries }],
  }
}

let db: FitLogDatabase
beforeEach(async () => {
  db = new FitLogDatabase('fitlog-test-' + crypto.randomUUID())
  await db.open()
})
afterEach(async () => { await db.delete() })

describe('workouts', () => {
  it('starts with exercises and no guessed workout data', async () => {
    expect(await db.workouts.count()).toBe(0)
    expect(await db.exercises.get(cable.id)).toEqual(cable)
    expect(newWorkout('Push').date).toBe(localDate())
  })

  it('persists a workout and edits sets and notes after reopening', async () => {
    const workout = fixture()
    await db.workouts.add(workout)
    db.close()
    await db.open()
    const reopened = (await db.workouts.get(workout.id))!
    expect(reopened).toEqual(workout)
    reopened.name = 'Push with trainer'
    reopened.exercises[0].sets[1].amount = 14
    reopened.exercises[0].sets.push({ ...newSet(cable), weight: 47.25, amount: 12, notes: 'Final set' })
    reopened.completedAt = new Date().toISOString()
    await db.workouts.put(reopened)
    db.close()
    await db.open()
    expect(await db.workouts.get(workout.id)).toEqual(reopened)
  })

  it('finds the latest earlier session, including another workout on the same date', () => {
    const earlier = { ...fixture(), createdAt: '2026-11-23T15:00:00.000Z' }
    const edited = { ...fixture(), createdAt: '2026-11-23T17:00:00.000Z' }
    const later = fixture('2026-11-24')
    const empty = fixture('2026-11-23', [newSet(cable)])
    const history = exerciseHistory([later, earlier, edited, empty], cable.id, edited)
    expect(history.map(session => session.workout.id)).toEqual([earlier.id])
    expect(history[0].sets.map(set => describeSet(set, cable))).toEqual(['50 lb × 15 reps', '55 lb × 13 reps', '50 lb × 15 reps'])
    expect(exerciseHistory([earlier], assisted.id, edited)).toEqual([])
  })

  it('copies sets and duplicates a workout without changing historical records', async () => {
    const original = fixture('2026-11-23', [{
      ...sets[0], unit: 'kg', notes: 'Machine upstairs', plates: { base: 20, added: 30 },
    }])
    await db.workouts.add(original)
    const copied = duplicateWorkout(original)
    const changed = copied.exercises[0].sets[0]
    expect(copied.id).not.toBe(original.id)
    expect(copied.exercises[0].id).not.toBe(original.exercises[0].id)
    expect(changed).toEqual({ ...original.exercises[0].sets[0], id: changed.id })
    expect(changed.id).not.toBe(original.exercises[0].sets[0].id)
    changed.plates!.added = 35
    changed.weight = 55
    await db.workouts.add(copied)
    expect(await db.workouts.get(original.id)).toEqual(original)
  })
})

describe('records', () => {
  const set = (patch: Partial<SetEntry>) => ({ ...sets[0], ...patch })

  it('normalizes compatible units and detects both load and repetition records', () => {
    expect(kilograms(100, 'lb')).toBeCloseTo(45.359237)
    expect(records(set({ weight: 22.68, unit: 'kg', amount: 16 }), cable, sets)).toEqual(['Most reps at load'])
    expect(records(set({ weight: 30, unit: 'kg' }), cable, sets)).toEqual(['Heaviest load'])
  })

  it('excludes unknown, incompatible and incomplete plate configurations', () => {
    expect(records(set({ weight: 100, scope: 'unknown' }), cable, sets)).toEqual([])
    expect(records(set({ weight: 100, scope: 'per-side' }), cable, sets)).toEqual([])
    expect(records(set({ weight: 100, plates: { base: null, added: 50 } }), cable, sets)).toEqual([])
    expect(records(set({ weight: 100 }), { ...cable, equipment: '' }, sets)).toEqual([])
  })

  it('recognizes reduced assistance at matching reps and excludes increased assistance', () => {
    const previous = { ...newSet(assisted), amount: 8, assistance: 60 }
    expect(records({ ...previous, assistance: 55 }, assisted, [previous])).toEqual(['Less assistance'])
    expect(records({ ...previous, assistance: 65 }, assisted, [previous])).toEqual([])
    expect(records({ ...previous, assistance: 55, amount: 7 }, assisted, [previous])).toEqual([])
  })
})

describe('backups and migration', () => {
  it('exports a complete backup and repeatedly restores without duplicates', async () => {
    const original = fixture()
    await db.workouts.add(original)
    const custom = { ...cable, id: crypto.randomUUID(), name: 'Custom variation' }
    await db.exercises.add(custom)
    const backup = validateBackup(JSON.parse(JSON.stringify(await createBackup(db))))
    expect(backup.counts).toEqual({ workouts: 1, exercises: starterExercises.length + 1, sets: 3, foods: 0, foodLogs: 0, weightEntries: 0 })
    const target = new FitLogDatabase('fitlog-restore-' + crypto.randomUUID())
    try {
      await target.workouts.add(fixture('2026-11-25'))
      await restoreBackup(target, backup)
      await restoreBackup(target, backup)
      expect(await target.workouts.toArray()).toEqual([original])
      expect(await target.exercises.get(custom.id)).toEqual(custom)
      expect(await target.settings.get('lastExport')).toEqual(backup.settings[0])
    } finally { await target.delete() }
  })

  it('rejects malformed files, unsupported versions, invalid references, and duplicate IDs without data loss', async () => {
    const original = fixture()
    await db.workouts.add(original)
    const backup = await createBackup(db)
    await expect(restoreBackup(db, { ...backup, version: 999 })).rejects.toThrow('unsupported')
    await expect(restoreBackup(db, { ...backup, workouts: null })).rejects.toThrow('invalid')
    const missing = structuredClone(backup)
    missing.workouts[0].exercises[0].exerciseId = 'missing'
    await expect(restoreBackup(db, missing)).rejects.toThrow('invalid')
    const duplicate = { ...backup, workouts: [original, original] }
    await expect(restoreBackup(db, duplicate)).rejects.toThrow('duplicate')
    expect(await db.workouts.toArray()).toEqual([original])
    expect(await db.exercises.count()).toBe(starterExercises.length)
  })

  it('retains version 1 records while adding the settings store', async () => {
    const original = fixture()
    const name = 'fitlog-migrate-' + crypto.randomUUID()
    const v1 = new Dexie(name)
    v1.version(1).stores({ workouts: workoutStore, exercises: 'id,name' })
    await v1.table('workouts').add(original)
    await v1.table('exercises').add(cable)
    v1.close()
    const migrated = new FitLogDatabase(name)
    try {
      expect(await migrated.workouts.get(original.id)).toEqual(original)
      expect(await migrated.exercises.get(cable.id)).toEqual(cable)
      expect(await migrated.settings.count()).toBe(0)
      expect(migrated.verno).toBe(4)
    } finally { await migrated.delete() }
  })
})
