import { useState } from 'react'
import { Check, Plus, Search } from 'lucide-react'
import { db } from '../data/db'
import { describeSet, exerciseHistory, workoutOrder } from '../data/history'
import { formatDate, type Exercise, type Workout } from '../data/model'

export function ExercisePicker({ exercises, workouts, workout, onAdd }: {
  exercises: Exercise[]
  workouts: Workout[]
  workout: Workout
  onAdd: (exercise: Exercise, copy?: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Exercise | null>(null)
  const [custom, setCustom] = useState(false)
  const [equipment, setEquipment] = useState('')
  const [mode, setMode] = useState<Exercise['mode']>('weight')
  const [measure, setMeasure] = useState<Exercise['measure']>('reps')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const matches = exercises.filter(exercise =>
    query.toLowerCase().trim().split(/\s+/).every(term =>
      (exercise.name + ' ' + exercise.equipment).toLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.equipment.localeCompare(b.equipment))
  const recent = [...new Set(workouts.slice().sort((a, b) => workoutOrder(b, a))
    .flatMap(item => item.exercises.map(entry => entry.exerciseId)))].slice(0, 6)
    .flatMap(id => matches.filter(exercise => exercise.id === id))
  const previous = selected ? exerciseHistory(workouts, selected.id, workout)[0] : null

  async function create() {
    if (!query.trim() || busy) return
    setBusy(true)
    const exercise = { id: crypto.randomUUID(), name: query.trim(), equipment: equipment.trim(), mode, measure }
    try {
      await db.exercises.add(exercise)
      onAdd(exercise)
    } catch {
      setError('Could not save this exercise. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <h2>Add exercise</h2>
    <label className="search"><Search size={19} /><input aria-label="Search exercises" placeholder="Search exercises"
      value={query} onChange={event => { setQuery(event.target.value); setSelected(null) }} /></label>
    {selected && <div className="previous picker-preview">
      <div className="row between"><strong>{selected.name}</strong><span className="badge">{selected.equipment || 'Unspecified'}</span></div>
      {previous ? <>
        <p>Last performed · {formatDate(previous.workout.date)}</p>
        <ol>{previous.sets.map(set => <li key={set.id}>{describeSet(set, selected)}</li>)}</ol>
      </> : <p>No earlier sets for this variation.</p>}
      <div className="row wrap">
        <button className="primary" onClick={() => onAdd(selected)}>Add exercise</button>
        {previous && <button className="secondary" onClick={() => onAdd(selected, true)}>Add and copy sets</button>}
      </div>
    </div>}
    {custom ? <form className="stack" onSubmit={event => { event.preventDefault(); void create() }}>
      <label className="field">Exercise name<input required value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="field">Equipment or variation<input placeholder="e.g. Cable · gym upstairs"
        value={equipment} onChange={event => setEquipment(event.target.value)} /></label>
      <div className="option-grid">
        <label className="field">Load type<select value={mode} onChange={event => setMode(event.target.value as Exercise['mode'])}>
          <option value="weight">External weight</option><option value="assisted">Assisted</option><option value="bodyweight">Bodyweight</option>
        </select></label>
        <label className="field">Track<select value={measure} onChange={event => setMeasure(event.target.value as Exercise['measure'])}>
          <option value="reps">Repetitions</option><option value="seconds">Seconds</option>
        </select></label>
      </div>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy || !query.trim()}>Create and add</button>
      <button className="text-button" type="button" onClick={() => setCustom(false)}>Back to library</button>
    </form> : <>
      {!query.trim() && recent.length > 0 && <div>
        <h3>Recently used</h3>
        <div className="row wrap">{recent.map(exercise => <button className="secondary" key={exercise.id}
          onClick={() => setSelected(exercise)}>{exercise.name} · {exercise.equipment || 'Custom'}</button>)}</div>
      </div>}
      <div className="exercise-list">{matches.map(exercise => <button key={exercise.id}
        className="exercise-option" aria-pressed={selected?.id === exercise.id} onClick={() => setSelected(exercise)}>
        <span><strong>{exercise.name}</strong><small>{exercise.equipment || 'Unspecified equipment'}</small></span>
        {selected?.id === exercise.id ? <Check size={19} /> : <Plus size={19} />}
      </button>)}</div>
      {!matches.length && <p>No exercises found.</p>}
      <button className="text-button" onClick={() => { setSelected(null); setCustom(true) }}><Plus size={17} /> Create custom exercise</button>
    </>}
  </>
}
