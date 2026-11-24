import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, Copy, History, Plus, Trash2 } from 'lucide-react'
import { copySets, formatDate, kinds, newSet, type Exercise, type Kind, type Workout, type WorkoutExercise } from '../data/model'
import { describeSet, exerciseHistory, records } from '../data/history'
import { ExercisePicker } from './ExercisePicker'
import { SetEditor } from './SetEditor'

export function WorkoutEditor({ workout, exercises, workouts, update, status, flush, close }: {
  workout: Workout
  exercises: Exercise[]
  workouts: Workout[]
  update: (change: (workout: Workout) => Workout) => void
  status: 'saved' | 'saving' | 'error'
  flush: () => Promise<boolean>
  close: () => Promise<boolean>
}) {
  const [picker, setPicker] = useState(false)
  const [history, setHistory] = useState<Exercise | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)

  function editItem(id: string, change: (item: WorkoutExercise) => WorkoutExercise) {
    update(current => ({ ...current, exercises: current.exercises.map(item => item.id === id ? change(item) : item) }))
  }

  function move(index: number, delta: number) {
    update(current => {
      const ordered = current.exercises.slice()
      const [item] = ordered.splice(index, 1)
      ordered.splice(index + delta, 0, item)
      return { ...current, exercises: ordered }
    })
  }

  function add(exercise: Exercise, copy = false) {
    const previous = copy ? exerciseHistory(workouts, exercise.id, workout)[0]?.sets ?? [] : []
    const item = {
      id: crypto.randomUUID(), exerciseId: exercise.id, notes: '',
      sets: previous.length ? copySets(previous) : [newSet(exercise)],
    }
    update(current => ({ ...current, exercises: [...current.exercises, item] }))
    setPicker(false)
  }

  async function finish() {
    setFinishing(true)
    update(current => ({ ...current, completedAt: new Date().toISOString() }))
    await close()
    setFinishing(false)
  }

  if (history) {
    const sessions = exerciseHistory(workouts.map(session => session.id === workout.id ? workout : session), history.id)
    return <div className="stack">
      <button className="text-button self-start" onClick={() => setHistory(null)}>Back to workout</button>
      <div><h1>{history.name}</h1><p>{history.equipment || 'Unspecified equipment'} · Exercise history</p></div>
      {!sessions.length && <div className="card"><p>No recorded sets yet.</p></div>}
      {sessions.map(session => <article className="card stack" key={session.workout.id}>
        <div><h3>{session.workout.name || session.workout.kind}</h3><p>{formatDate(session.workout.date)}</p></div>
        <ol className="history-sets">{session.sets.map(set => <li key={set.id}>
          {describeSet(set, history)}{set.notes && <small>{set.notes}</small>}
        </li>)}</ol>
      </article>)}
    </div>
  }

  return <div className="stack">
    <div className="row between">
      <button className="text-button" onClick={() => void close()}>All workouts</button>
      <span className={'save-status ' + (status === 'error' ? 'danger' : '')} role="status">
        {status === 'saved' && <Check size={15} />}
        {status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Save failed'}
      </span>
    </div>
    {status === 'error' && <div className="card error" role="alert">
      <p>Your edits are still in this editor. Retry to save them.</p>
      <button className="secondary" onClick={() => void flush()}>Retry save</button>
    </div>}
    <div><h1>{workout.name || workout.kind}</h1><p>{workout.completedAt ? 'Completed workout' : 'Workout in progress'}</p></div>
    <div className="card stack">
      <div className="option-grid">
        <label className="field">Name<input value={workout.name} onChange={event => {
          const name = event.target.value
          update(current => ({ ...current, name }))
        }} /></label>
        <label className="field">Split<select value={workout.kind} onChange={event => {
          const kind = event.target.value as Kind
          update(current => ({ ...current, kind, name: current.name === current.kind ? kind : current.name }))
        }}>{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <label className="field">Date<input type="date" value={workout.date} onChange={event => {
          const date = event.target.value
          if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) update(current => ({ ...current, date }))
        }} /></label>
      </div>
      <label className="field">Workout notes<textarea rows={2} placeholder="Optional" value={workout.notes}
        onChange={event => {
          const notes = event.target.value
          update(current => ({ ...current, notes }))
        }} /></label>
    </div>
    <div className="row between"><h2>Exercises</h2>
      {!picker && <button className="secondary" onClick={() => setPicker(true)}><Plus size={18} /> Add exercise</button>}
    </div>
    {picker && <section className="card stack">
      <button className="text-button self-start" onClick={() => setPicker(false)}>Cancel</button>
      <ExercisePicker exercises={exercises} workouts={workouts} workout={workout} onAdd={add} />
    </section>}
    {!workout.exercises.length && !picker && <div className="card"><p>Add an exercise to log your first set.</p></div>}
    {workout.exercises.map((item, index) => {
      const exercise = exercises.find(entry => entry.id === item.exerciseId)
      if (!exercise) return null
      const sessions = exerciseHistory(workouts, exercise.id, workout)
      const recent = sessions[0]
      const earlier = sessions.flatMap(session => session.sets)
      const append = (sets: typeof item.sets) => editItem(item.id, current => ({
        ...current, sets: [...current.sets.filter(set => set.amount !== null || set.weight !== null ||
          set.assistance !== null || set.notes || set.plates), ...copySets(sets)],
      }))
      return <article className="card stack" key={item.id}>
        <div className="row between wrap">
          <div><h3>{exercise.name}</h3><p>{exercise.equipment || 'Unspecified equipment'}</p></div>
          <div className="row">
            <button className="icon-button" disabled={index === 0} aria-label="Move exercise up" onClick={() => move(index, -1)}><ArrowUp size={17} /></button>
            <button className="icon-button" disabled={index === workout.exercises.length - 1} aria-label="Move exercise down"
              onClick={() => move(index, 1)}><ArrowDown size={17} /></button>
            <button className="icon-button" aria-label="Remove exercise" onClick={() => setRemoving(item.id)}><Trash2 size={17} /></button>
          </div>
        </div>
        {removing === item.id && <div className="row wrap">
          <span>Remove this exercise and its sets?</span>
          <button className="secondary danger" onClick={() => {
            update(current => ({ ...current, exercises: current.exercises.filter(entry => entry.id !== item.id) }))
            setRemoving(null)
          }}>Remove</button>
          <button className="text-button" onClick={() => setRemoving(null)}>Cancel</button>
        </div>}
        <div className="previous">
          <div className="row between wrap">
            <strong>Previous performance</strong>
            <button className="text-button" onClick={() => setHistory(exercise)}><History size={17} /> History</button>
          </div>
          {recent ? <>
            <p>Last performed · {formatDate(recent.workout.date)}</p>
            <ol>{recent.sets.map((set, setIndex) => <li key={set.id}>
              <div className="row between">
                <span>{describeSet(set, exercise)}</span>
                <button className="icon-button" aria-label={'Copy previous set ' + (setIndex + 1)}
                  onClick={() => append([set])}><Copy size={16} /></button>
              </div>
              {set.notes && <small>{set.notes}</small>}
            </li>)}</ol>
            <button className="secondary" onClick={() => append(recent.sets)}><Copy size={17} /> Copy previous sets</button>
          </> : <p>No earlier sets for this variation.</p>}
        </div>
        {item.sets.map((set, setIndex) => <SetEditor key={set.id} exercise={exercise} set={set} index={setIndex}
          badges={records(set, exercise, earlier)}
          update={change => editItem(item.id, current => ({
            ...current, sets: current.sets.map(entry => entry.id === set.id ? { ...entry, ...change } : entry),
          }))}
          remove={() => editItem(item.id, current => ({
            ...current, sets: current.sets.filter(entry => entry.id !== set.id),
          }))} />)}
        <button className="secondary self-start" onClick={() => editItem(item.id, current => {
          const last = current.sets.at(-1)
          const next = newSet(exercise)
          return { ...current, sets: [...current.sets, last
            ? { ...next, unit: last.unit, mode: last.mode, scope: last.scope } : next] }
        })}><Plus size={17} /> Add set</button>
        <details><summary>Exercise notes</summary>
          <label className="field"><span className="sr-only">Exercise notes</span><textarea rows={2} value={item.notes}
            onChange={event => {
              const notes = event.target.value
              editItem(item.id, current => ({ ...current, notes }))
            }} /></label>
        </details>
      </article>
    })}
    {!workout.completedAt && <button className="primary finish" disabled={finishing} onClick={() => void finish()}>
      <Check size={20} /> Complete workout
    </button>}
    {workout.completedAt && <button className="secondary finish" onClick={() =>
      update(current => ({ ...current, completedAt: null }))}>Mark as in progress</button>}
  </div>
}
