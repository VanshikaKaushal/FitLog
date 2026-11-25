import { useState } from 'react'
import { db } from '../../data/db'
import { fromKg, toKg, type WeightEntry, type WeightUnit } from '../../data/weight/model'
import { deleteWeighIn, saveWeighIn, WeighInConflict } from '../../data/weight/store'
import { formatDate } from '../../data/model'

export function WeighInEditor({ entry, today, preferredUnit, entries, close }: {
  entry?: WeightEntry; today: string; preferredUnit: WeightUnit; entries: WeightEntry[]; close: () => void
}) {
  const [date, setDate] = useState(entry?.date ?? today)
  const [unit, setUnit] = useState(preferredUnit)
  const [weight, setWeight] = useState(entry ? String(fromKg(entry.recordedKg, preferredUnit)) : '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [recalculate, setRecalculate] = useState(false)
  const [conflict, setConflict] = useState<WeightEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const affectedDate = entry && entry.date < date ? entry.date : date
  const hasImported = entries.some(item => item.date >= affectedDate && item.importedAverageKg !== null)

  async function run(task: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try { await task(); close() } catch (error) {
      if (error instanceof WeighInConflict) setConflict(error.entry)
      else setError(error instanceof Error ? error.message : 'Could not save the weigh-in.')
    } finally { setBusy(false) }
  }

  function save(confirmedId?: string) {
    return run(() => saveWeighIn(db, { date, weight: Number(weight), unit, notes }, {
      editId: entry?.id, confirmedId, recalculate, today,
    }))
  }

  return <form className="card stack" onSubmit={event => { event.preventDefault(); void save() }}>
    <div className="row between wrap"><h2>{entry ? 'Edit weigh-in' : 'Add Weight'}</h2>
      <button className="text-button" type="button" disabled={busy} onClick={close}>Cancel</button>
    </div>
    <fieldset disabled={busy} className="stack">
      <label className="field">Date<input required type="date" max={today} value={date}
        onChange={event => { setDate(event.target.value); setConflict(null) }} /></label>
      <div className="option-grid">
        <label className="field">Recorded weight<input required type="number" min="0" step="any" inputMode="decimal"
          value={weight} onChange={event => { setWeight(event.target.value); setConflict(null) }} /></label>
        <label className="field">Unit<select value={unit} onChange={event => {
          const next = event.target.value as WeightUnit
          if (weight && Number.isFinite(Number(weight))) setWeight(String(fromKg(toKg(Number(weight), unit), next)))
          setUnit(next)
          setConflict(null)
        }}><option value="lb">Pounds (lb)</option><option value="kg">Kilograms (kg)</option></select></label>
      </div>
      <label className="field">Notes<textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></label>
      {entry?.importedAverageKg != null && <p>Original imported average · {fromKg(entry.importedAverageKg, unit).toLocaleString(undefined, {
        minimumFractionDigits: 1, maximumFractionDigits: 1,
      })} {unit}{entry.importedTrendStale ? ' · Recorded data was edited.' : ''}</p>}
      {hasImported && <div className="previous stack">
        <p>Changes on this date can affect later trends. Original CSV averages are kept.</p>
        <label className="check"><input type="checkbox" checked={recalculate}
          onChange={event => setRecalculate(event.target.checked)} /> Use FitLog to recalculate affected averages</label>
      </div>}
      {error && <p className="danger" role="alert">{error}</p>}
      {conflict && <div className="previous stack" role="status">
        <p>A weigh-in already exists on {formatDate(conflict.date)}.</p>
        {!entry && <button className="secondary self-start" type="button" onClick={() => void save(conflict.id)}>Update existing weigh-in</button>}
        {entry && <p>Choose a different date or edit the existing entry separately.</p>}
      </div>}
      <div className="row wrap">
        <button className="primary" disabled={!!conflict}>Save weigh-in</button>
        {entry && <button className="text-button danger" type="button" onClick={() => setDeleting(true)}>Delete weigh-in</button>}
      </div>
      {deleting && entry && <div className="previous stack">
        <p>Remove this weigh-in and its note?</p>
        <div className="row wrap"><button className="secondary danger" type="button"
          onClick={() => void run(() => deleteWeighIn(db, entry.id, recalculate))}>Confirm deletion</button>
          <button className="text-button" type="button" onClick={() => setDeleting(false)}>Keep entry</button></div>
      </div>}
    </fieldset>
  </form>
}
