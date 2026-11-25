import type { FitLogDatabase } from './db'
import {
  isCalendarDate, isQuantity, meals, scaledNutrition, units, validNutrition,
  type Food, type FoodDraft, type FoodLogEntry, type LogDraft,
} from './nutrition'

function validateFood(draft: FoodDraft) {
  if (!draft.name.trim() || !isQuantity(draft.serving.quantity) || !units.includes(draft.serving.unit)
      || !validNutrition(draft.serving.nutrition)) {
    throw new Error('Enter a food name, a positive serving size, and valid nutrition values.')
  }
}

export async function saveFood(db: FitLogDatabase, draft: FoodDraft, id?: string) {
  validateFood(draft)
  const food: Food = { ...draft, id: id ?? crypto.randomUUID(), name: draft.name.trim() }
  if (id) {
    if (!await db.foods.update(id, food)) throw new Error('This food was deleted. Create a new food to save it again.')
  } else await db.foods.add(food)
  return food
}

export async function saveLog(db: FitLogDatabase, draft: LogDraft, id?: string, libraryFood?: FoodDraft) {
  if (!draft.name.trim() || !isCalendarDate(draft.date) || !meals.includes(draft.meal)
      || !validNutrition(draft.nutrition) || (draft.quantity !== null && !isQuantity(draft.quantity))
      || (draft.unit !== null && (!units.includes(draft.unit) || draft.quantity === null))
      || (draft.reference !== null && (draft.quantity === null || draft.unit !== draft.reference.unit))) {
    throw new Error('Enter a food name, valid nutrition values, and a valid date, meal, and quantity.')
  }
  return db.transaction('rw', db.foodLogs, db.foods, async () => {
    const existing = id ? await db.foodLogs.get(id) : undefined
    if (id && !existing) throw new Error('This entry was deleted. Open a new entry to log it again.')
    const saved = libraryFood ? await saveFood(db, libraryFood) : null
    const now = new Date().toISOString()
    const entry: FoodLogEntry = {
      ...draft, id: id ?? crypto.randomUUID(), name: draft.name.trim(),
      foodId: saved?.id ?? draft.foodId,
      nutrition: draft.reference && draft.quantity !== null
        ? scaledNutrition(draft.reference, draft.quantity) : draft.nutrition,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    await db.foodLogs.put(entry)
    return entry
  })
}

export function getDay(db: FitLogDatabase, date: string) {
  return db.foodLogs.where('date').equals(date).sortBy('createdAt')
}
