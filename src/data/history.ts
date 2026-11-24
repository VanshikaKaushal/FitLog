import type { Exercise, SetEntry, Unit, Workout } from './model'

export function workoutOrder(a: Workout, b: Workout) {
  return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

export function exerciseHistory(workouts: Workout[], exerciseId: string, before?: Workout) {
  return workouts.filter(workout => !before || (workout.id !== before.id && workoutOrder(workout, before) < 0))
    .sort((a, b) => workoutOrder(b, a))
    .flatMap(workout => {
      const sets = workout.exercises.filter(item => item.exerciseId === exerciseId)
        .flatMap(item => item.sets).filter(set => (set.amount ?? 0) > 0)
      return sets.length ? [{ workout, sets }] : []
    })
}

export function kilograms(weight: number, unit: Unit) {
  return unit === 'lb' ? weight * 0.45359237 : weight
}

export function describeSet(set: SetEntry, exercise: Exercise) {
  const amount = set.amount == null ? '—' : set.amount + (exercise.measure === 'seconds' ? ' s' : ' reps')
  if (set.mode === 'bodyweight') return 'Bodyweight · ' + amount
  const value = set.mode === 'assisted' ? set.assistance : set.weight
  const scope = set.scope === 'per-side' ? ' / side' : set.scope === 'unknown' ? ' · scope unknown' : ''
  const breakdown = set.plates
    ? ' · base ' + (set.plates.base ?? '?') + ' + plates ' + (set.plates.added ?? '?') + ' ' + set.unit : ''
  return (value == null ? '—' : value + ' ' + set.unit) + scope
    + (set.mode === 'assisted' ? ' assist' : '') + ' × ' + amount + breakdown
}

function comparable(set: SetEntry, exercise: Exercise) {
  if (!exercise.equipment.trim() || set.scope === 'unknown' || !set.amount) return null
  if (set.plates && (set.mode !== 'weight' || set.scope !== 'total' ||
      set.plates.base == null || set.plates.added == null || set.weight == null ||
      Math.abs(set.plates.base + set.plates.added - set.weight) > 0.000001)) return null
  const value = set.mode === 'bodyweight' ? 0 : set.mode === 'assisted' ? set.assistance : set.weight
  if (value == null || (set.mode === 'assisted' && set.scope !== 'total')) return null
  return {
    key: [exercise.id, set.mode, set.scope, set.plates ? 'plate breakdown' : 'direct'].join('|'),
    load: kilograms(value, set.unit),
    amount: set.amount,
  }
}

export function records(set: SetEntry, exercise: Exercise, earlier: SetEntry[]) {
  const current = comparable(set, exercise)
  if (!current) return []
  const previous = earlier.map(item => comparable(item, exercise))
    .filter(item => item !== null).filter(item => item.key === current.key)
  if (!previous.length) return []
  const tolerance = 0.005
  const atLoad = previous.filter(item => Math.abs(item.load - current.load) < tolerance)
  const results: string[] = []
  if (set.mode === 'weight' && previous.every(item => current.load - item.load >= tolerance)) {
    results.push('Heaviest load')
  }
  if (set.mode === 'assisted' && previous.some(item => item.amount === current.amount)
    && previous.filter(item => item.amount >= current.amount).every(item => item.load - current.load >= tolerance)) {
    results.push('Less assistance')
  }
  if (atLoad.length && atLoad.every(item => current.amount > item.amount)) {
    results.push(exercise.measure === 'seconds' ? 'Longest duration at load' : 'Most reps at load')
  }
  return results
}
