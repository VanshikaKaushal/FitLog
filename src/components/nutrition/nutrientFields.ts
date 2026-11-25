import type { Nutrition } from '../../data/nutrition'

export type NutrientFields = Record<keyof Nutrition, string>

export function nutrientFields(nutrition?: Nutrition): NutrientFields {
  return {
    calories: String(nutrition?.calories ?? ''), protein: String(nutrition?.protein ?? ''),
    carbs: String(nutrition?.carbs ?? ''), fat: String(nutrition?.fat ?? ''), fiber: String(nutrition?.fiber ?? ''),
  }
}

export function parseNutrients(fields: NutrientFields): Nutrition {
  const optional = (value: string) => value.trim() === '' ? null : Number(value)
  if (fields.calories.trim() === '') throw new Error('Enter calories, including zero when applicable.')
  return { calories: Number(fields.calories), protein: optional(fields.protein), carbs: optional(fields.carbs),
    fat: optional(fields.fat), fiber: optional(fields.fiber) }
}
