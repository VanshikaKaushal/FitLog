export type Unit = 'lb' | 'kg'
export type Mode = 'weight' | 'assisted' | 'bodyweight'
export type ModeScope = 'total' | 'per-side' | 'unknown'
export const kinds = ['Push', 'Pull', 'Legs', 'Custom'] as const
export type Kind = typeof kinds[number]

export interface Exercise {
  id: string
  name: string
  equipment: string
  mode: Mode
  measure: 'reps' | 'seconds'
}

export interface SetEntry {
  id: string
  amount: number | null
  weight: number | null
  assistance: number | null
  unit: Unit
  mode: Mode
  scope: ModeScope
  notes: string
  plates?: { base: number | null; added: number | null }
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  notes: string
  sets: SetEntry[]
}

export interface Workout {
  id: string
  name: string
  kind: Kind
  date: string
  createdAt: string
  completedAt: string | null
  notes: string
  exercises: WorkoutExercise[]
}

export function localDate(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(value => String(value).padStart(2, '0')).join('-')
}

export function formatDate(date: string, options: Intl.DateTimeFormatOptions = {
  month: 'long', day: 'numeric', year: 'numeric',
}) {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, options)
}

export function newWorkout(kind: Kind, date = localDate()): Workout {
  return {
    id: crypto.randomUUID(), kind, name: kind, date, createdAt: new Date().toISOString(),
    completedAt: null, notes: '', exercises: [],
  }
}

export function newSet(exercise: Exercise): SetEntry {
  return {
    id: crypto.randomUUID(), amount: null, weight: null, assistance: null,
    unit: 'lb', mode: exercise.mode, scope: 'total', notes: '',
  }
}

export function copySets(sets: SetEntry[]): SetEntry[] {
  return sets.map(set => ({ ...structuredClone(set), id: crypto.randomUUID() }))
}

export function duplicateWorkout(source: Workout): Workout {
  return {
    ...newWorkout(source.kind), name: source.name, notes: source.notes,
    exercises: source.exercises.map(exercise => ({
      ...exercise, id: crypto.randomUUID(), sets: copySets(exercise.sets),
    })),
  }
}

const starters: [string, string, Mode?, Exercise['measure']?][] = [
  ['Chest Press', 'Machine'], ['Chest Press', 'Dumbbell'], ['Chest Fly', 'Cable'],
  ['Chest Fly', 'Machine'], ['Tricep Pushdown', 'Cable'], ['Overhead Tricep Extension', 'Cable'],
  ['Lateral Raises', 'Dumbbell'], ['Front Raises', 'Dumbbell'], ['Bicep Curl', 'Dumbbell'],
  ['Hammer Curl', 'Dumbbell'], ['Lat Pulldown', 'Cable'], ['Assisted Pull-up', 'Machine', 'assisted'],
  ['Seated Row', 'Cable'], ['Leg Press', 'Plate-loaded machine'], ['Leg Extension', 'Machine'],
  ['Hamstring Curl', 'Machine'], ['Glute Kickback', 'Cable'], ['Hip Thrust', 'Barbell'],
  ['Romanian Deadlift', 'Barbell'], ['Romanian Deadlift', 'Dumbbell'],
  ['Hip Abduction', 'Machine'], ['Hip Adduction', 'Machine'],
  ['Plank', 'Bodyweight', 'bodyweight', 'seconds'], ['Hanging Knee Raise', 'Bodyweight', 'bodyweight'],
]

export const starterExercises: Exercise[] = starters.map(([name, equipment, mode = 'weight', measure = 'reps']) => ({
  id: 'starter:' + (name + '-' + equipment).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name, equipment, mode, measure,
}))
