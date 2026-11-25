import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup, validateBackup } from './backup'
import { FitLogDatabase, workoutStore } from './db'
import { newWorkout } from './model'
import { scaledNutrition, shiftDay, summarize, type FoodDraft, type LogDraft } from './nutrition'
import { copyMeal, getDay, saveFood, saveLog } from './nutritionStore'

const food: FoodDraft = {
  name: 'Test yogurt', brand: 'Test kitchen', category: 'Dairy', notes: '', source: 'Test label',
  verified: true, favorite: false,
  serving: { quantity: 170, unit: 'g', nutrition: { calories: 100, protein: 18, carbs: 0, fat: null, fiber: null } },
}

const quick: LogDraft = {
  date: '2026-03-08', meal: 'Breakfast', foodId: null, name: 'Test meal', quantity: null, unit: null,
  description: '1 bowl', nutrition: { calories: 120, protein: 3.25, carbs: null, fat: 2, fiber: null },
  reference: null, source: '', verified: false, notes: '',
}

let db: FitLogDatabase
beforeEach(async () => {
  db = new FitLogDatabase('fitlog-nutrition-test-' + crypto.randomUUID())
  await db.open()
})
afterEach(async () => { await db.delete() })

describe('serving calculations', () => {
  it('scales the supplied reference and preserves explicitly entered zero and unknown values', () => {
    expect(scaledNutrition(food.serving, 85)).toEqual({
      calories: 50, protein: 9, carbs: 0, fat: null, fiber: null,
    })
    const decimal = scaledNutrition(food.serving, 42.55)
    expect(decimal.calories).toBeCloseTo(25.029411764706, 10)
    expect(decimal.protein).toBeCloseTo(4.505294117647, 10)
    expect(() => scaledNutrition(food.serving, -1)).toThrow()
    expect(() => scaledNutrition({ ...food.serving, quantity: 0 }, 85)).toThrow()
  })
})

describe('the diary and library', () => {
  it('creates and edits saved foods and preserves snapshots after library edits and deletion', async () => {
    const saved = await saveFood(db, food)
    const entry = await saveLog(db, {
      ...quick, name: saved.name, foodId: saved.id, quantity: 85, unit: 'g',
      reference: saved.serving, nutrition: saved.serving.nutrition,
    })
    const changed = await saveFood(db, {
      ...food, name: 'Updated yogurt', serving: { ...food.serving, nutrition: { ...food.serving.nutrition, calories: 180 } },
    }, saved.id)
    expect(await db.foods.get(saved.id)).toEqual(changed)
    expect((await db.foodLogs.get(entry.id))?.nutrition.calories).toBe(50)
    await db.foods.delete(saved.id)
    const edited = await saveLog(db, { ...entry, quantity: 42.5 }, entry.id)
    expect(edited.nutrition.calories).toBe(25)
    expect(edited.nutrition.protein).toBe(4.5)
  })

  it('adds, edits, moves, deletes, and reloads food entries by local date', async () => {
    const original = await saveLog(db, quick)
    await saveLog(db, { ...quick, date: '2025-11-23', meal: 'Dinner' })
    const moved = await saveLog(db, { ...quick, date: '2026-03-09', meal: 'Snacks', name: 'Edited meal' }, original.id)
    expect(moved.createdAt).toBe(original.createdAt)
    db.close()
    await db.open()
    expect(await getDay(db, quick.date)).toEqual([])
    expect(await getDay(db, moved.date)).toEqual([moved])
    expect(await getDay(db, '2025-11-23')).toHaveLength(1)
    await db.foodLogs.delete(moved.id)
    expect(await getDay(db, moved.date)).toEqual([])
    expect(shiftDay('2026-03-08', -1)).toBe('2026-03-07')
  })

  it('calculates meal and daily totals independently and flags only missing nutrients', async () => {
    const breakfast = await saveLog(db, quick)
    const lunch = await saveLog(db, { ...quick, meal: 'Lunch',
      nutrition: { calories: 70.4, protein: 2, carbs: 0, fat: null, fiber: null } })
    expect(summarize([breakfast]).totals.calories).toBe(120)
    const summary = summarize([breakfast, lunch])
    expect(summary.totals).toEqual({ calories: 190.4, protein: 5.25, carbs: 0, fat: 2, fiber: 0 })
    expect(summary.incomplete).toEqual(new Set(['carbs', 'fat', 'fiber']))
    expect(summary.known.has('carbs')).toBe(true)
    expect(summary.known.has('fiber')).toBe(false)
  })

  it('copies an earlier meal as independent entries', async () => {
    const original = await saveLog(db, quick)
    await saveLog(db, { ...quick, meal: 'Lunch' })
    expect(await copyMeal(db, quick.date, 'Breakfast', '2026-03-10', 'Dinner')).toBe(1)
    const [copy] = await getDay(db, '2026-03-10')
    expect(copy.id).not.toBe(original.id)
    expect(copy.meal).toBe('Dinner')
    expect(copy.nutrition).toEqual(original.nutrition)
    await saveLog(db, { ...copy, nutrition: { ...copy.nutrition, calories: 155 } }, copy.id)
    expect(await db.foodLogs.get(original.id)).toEqual(original)
    await expect(copyMeal(db, '2026-03-10', 'Dinner', quick.date, 'Lunch')).rejects.toThrow('earlier')
  })

  it('saves a quick entry and reusable food in one operation and rejects invalid input', async () => {
    const entry = await saveLog(db, quick, undefined, food)
    expect(await db.foods.get(entry.foodId!)).toMatchObject({ name: food.name })
    await expect(saveLog(db, { ...quick, date: '2026-02-31' })).rejects.toThrow()
    await expect(saveLog(db, { ...quick, nutrition: { ...quick.nutrition, protein: -1 } })).rejects.toThrow()
    await expect(saveLog(db, { ...quick, quantity: 1, unit: 'mL', reference: food.serving })).rejects.toThrow()
    expect(await db.foodLogs.count()).toBe(1)
  })
})

describe('migration and backups', () => {
  it('adds nutrition stores to a v2 database while preserving workouts and settings', async () => {
    const name = 'fitlog-nutrition-migrate-' + crypto.randomUUID()
    const old = new Dexie(name)
    old.version(2).stores({ workouts: workoutStore, exercises: 'id,name', settings: 'key' })
    const workout = newWorkout('Push', quick.date)
    const setting = { key: 'lastExport', value: '2026-03-01T00:00:00.000Z' }
    await old.table('settings').add(setting)
    await old.table('workouts').add(workout)
    old.close()
    const upgraded = new FitLogDatabase(name)
    try {
      expect(await upgraded.workouts.get(workout.id)).toEqual(workout)
      expect(await upgraded.settings.get('lastExport')).toEqual(setting)
      expect(await upgraded.foods.count()).toBe(0)
      expect(await upgraded.foodLogs.count()).toBe(0)
    } finally { await upgraded.delete() }
  })

  it('exports and restores workouts, foods, and logs together', async () => {
    const workout = newWorkout('Legs', quick.date)
    await db.workouts.add(workout)
    const entry = await saveLog(db, quick, undefined, food)
    const snapshot = await createBackup(db)
    expect(snapshot.version).toBe(3)
    expect(snapshot.counts).toMatchObject({ workouts: 1, foods: 1, foodLogs: 1 })
    await db.workouts.clear()
    await db.foodLogs.clear()
    await db.foods.clear()
    await restoreBackup(db, JSON.parse(JSON.stringify(snapshot)))
    expect(await db.workouts.get(workout.id)).toEqual(workout)
    expect(await db.foodLogs.get(entry.id)).toEqual(entry)
    expect(await db.foods.get(entry.foodId!)).toMatchObject(food)
  })

  it('accepts older workout-only backups and keeps newer nutrition records', async () => {
    const entry = await saveLog(db, quick, undefined, food)
    const current = await createBackup(db)
    const legacy = {
      format: current.format, version: 1, exportedAt: current.exportedAt,
      workouts: current.workouts, exercises: current.exercises, settings: current.settings,
      counts: { workouts: 0, exercises: current.counts.exercises, sets: 0 },
    }
    expect(validateBackup(legacy).version).toBe(1)
    await restoreBackup(db, legacy)
    expect(await db.foodLogs.get(entry.id)).toEqual(entry)
    expect(await db.foods.count()).toBe(1)
  })

  it('rejects malformed nutrition backup records before replacing existing data', async () => {
    const workout = newWorkout('Pull', quick.date)
    await db.workouts.add(workout)
    const entry = await saveLog(db, quick)
    const backup = await createBackup(db)
    backup.foodLogs[0].nutrition.calories = -10
    await expect(restoreBackup(db, backup)).rejects.toThrow('invalid')
    expect(await db.foodLogs.get(entry.id)).toEqual(entry)
    expect(await db.workouts.get(workout.id)).toEqual(workout)
  })
})
