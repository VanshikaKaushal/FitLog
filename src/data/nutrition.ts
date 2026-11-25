import { localDate } from './model'

export const meals = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const
export const units = ['g', 'mL', 'tsp', 'tbsp', 'pieces', 'bottles', 'servings'] as const
export const nutrients = [
  { key: 'calories', label: 'Calories', short: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', short: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbohydrates', short: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', short: 'Fat', unit: 'g' },
  { key: 'fiber', label: 'Fiber', short: 'Fiber', unit: 'g' },
] as const

export type Meal = typeof meals[number]
export type Unit = typeof units[number]
export type Nutrient = typeof nutrients[number]['key']
export type Nutrition = { calories: number } & Record<Exclude<Nutrient, 'calories'>, number | null>

export interface Serving {
  quantity: number
  unit: Unit
  nutrition: Nutrition
}

export interface FoodDraft {
  name: string
  brand: string
  category: string
  serving: Serving
  notes: string
  source: string
  verified: boolean
  favorite: boolean
}

export interface Food extends FoodDraft {
  id: string
}

export interface LogDraft {
  date: string
  meal: Meal
  foodId: string | null
  name: string
  quantity: number | null
  unit: Unit | null
  description: string
  nutrition: Nutrition
  reference: Serving | null
  source: string
  verified: boolean
  notes: string
}

export interface FoodLogEntry extends LogDraft {
  id: string
  createdAt: string
  updatedAt: string
}

export const emptyNutrition: Nutrition = { calories: 0, protein: null, carbs: null, fat: null, fiber: null }
export const isQuantity = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1e9

export function validNutrition(value: unknown): value is Nutrition {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return nutrients.every(({ key }) => {
    const number = data[key]
    return (key !== 'calories' && number === null)
      || (typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1e12)
  })
}

export function scaledNutrition(serving: Serving, quantity: number): Nutrition {
  if (!isQuantity(serving.quantity) || !isQuantity(quantity) || !validNutrition(serving.nutrition)) {
    throw new Error('Enter a valid serving and a quantity greater than zero.')
  }
  const ratio = quantity / serving.quantity
  const scale = (value: number | null) => value === null ? null : value * ratio
  const result = {
    calories: serving.nutrition.calories * ratio, protein: scale(serving.nutrition.protein),
    carbs: scale(serving.nutrition.carbs), fat: scale(serving.nutrition.fat), fiber: scale(serving.nutrition.fiber),
  }
  if (!validNutrition(result)) throw new Error('These values are too large to calculate.')
  return result
}

export function summarize(entries: FoodLogEntry[]) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  const incomplete = new Set<Nutrient>()
  const known = new Set<Nutrient>()
  for (const entry of entries) {
    for (const { key } of nutrients) {
      const value = entry.nutrition[key]
      if (value === null) incomplete.add(key)
      else {
        totals[key] += value
        known.add(key)
      }
    }
  }
  return { totals, incomplete, known }
}

export function formatNutrient(value: number, key: Nutrient) {
  return value.toLocaleString(undefined, { maximumFractionDigits: key === 'calories' ? 0 : 1 })
}

export function shiftDay(date: string, days: number) {
  const next = new Date(date + 'T12:00:00')
  next.setDate(next.getDate() + days)
  return localDate(next)
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T12:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
