import { useState } from 'react'
import { Upload } from 'lucide-react'
import { db } from '../../data/db'
import { formatDate } from '../../data/model'
import { parseWeightCsv } from '../../data/weight/csv'
import { validWeighInDate, type WeightEntry, type WeightUnit } from '../../data/weight/model'
import { csvMatches, importWeights } from '../../data/weight/store'

export function WeightImport({ entries, today, close, done }: {
  entries: WeightEntry[]; today: string; close: () => void; done: (message: string) => void
}) {
  const [text, setText] = useState('')
  const [unit, setUnit] = useState<WeightUnit | ''>('')
  const [preview, setPreview] = useState<ReturnType<typeof parseWeightCsv> | null>(null)
  const [conflictPolicy, setConflictPolicy] = useState<'keep' | 'replace'>('keep')
  const [confirmed, setConfirmed] = useState(false)
  const [earliest, setEarliest] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const existing = new Map(entries.map(entry => [entry.date, entry]))
  const collisions = preview?.entries.filter(entry => existing.has(entry.date)) ?? []
  const conflicts = collisions.filter(row => unit && !csvMatches(existing.get(row.date)!, row, unit))
  const original = preview?.entries[0]?.date
  const last = preview?.entries.at(-1)?.date

  function reset() { setPreview(null); setConfirmed(false); setError(''); setConflictPolicy('keep') }

  function makePreview() {
    reset()
    if (!unit) return
    try {
      const result = parseWeightCsv(text, unit)
      if (result.entries.some(row => !validWeighInDate(row.date, today))) throw new Error('Weigh-in dates must be through today.')
      setPreview(result)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not read the CSV.') }
  }

  return <section className="card stack">
    <div className="row between wrap"><h2>Import Happy Scale CSV</h2>
      <button className="text-button" disabled={busy} onClick={close}>Cancel</button>
    </div>
    <p>Choose the CSV or paste its contents. The file needs the Date, Recorded, Moving Average header.</p>
    <label className="secondary file-picker self-start"><Upload size={17} /> Choose CSV file
      <input type="file" accept=".csv,text/csv,text/plain" aria-label="Choose weight CSV file" disabled={busy}
        onChange={async event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          reset()
          setBusy(true)
          try { setText(await file.text()) } catch { setError('This file could not be read.') }
          finally { setBusy(false) }
        }} />
    </label>
    <label className="field">CSV text<textarea rows={5} value={text} disabled={busy}
      onChange={event => { setText(event.target.value); reset() }} /></label>
    <label className="field">Unit in CSV<select value={unit} disabled={busy} onChange={event => {
      setUnit(event.target.value as WeightUnit | ''); reset()
    }}><option value="">Select the source unit</option><option value="lb">Pounds (lb)</option><option value="kg">Kilograms (kg)</option></select></label>
    <button className="secondary self-start" disabled={!unit || !text.trim() || busy} onClick={makePreview}>Preview import</button>
    {error && <p className="danger" role="alert">{error}</p>}
    {preview && original && last && <div className="previous stack">
      <h3>Import preview</h3>
      <p>{preview.rowCount} valid rows · {preview.entries.length} unique dates · {unit}</p>
      <p>{formatDate(original)} to {formatDate(last)}</p>
      <p>{preview.withAverage} of {preview.rowCount} rows include moving averages. Missing averages will be calculated by FitLog.</p>
      <p>{preview.duplicateDates.length} duplicate dates in the file. The last row is used for each duplicate date.</p>
      {preview.duplicateDates.length > 0 && <details><summary>Show duplicate dates</summary><p>{preview.duplicateDates.join(', ')}</p></details>}
      <p>{collisions.length} dates already logged · {conflicts.length} conflicting dates</p>
      {conflicts.length > 0 && <details><summary>Show conflicting dates</summary><p>{conflicts.map(row => row.date).join(', ')}</p></details>}
      <label className="field">When a date conflicts<select value={conflictPolicy} disabled={busy}
        onChange={event => { setConflictPolicy(event.target.value as typeof conflictPolicy); setConfirmed(false) }}>
        <option value="keep">Keep existing records</option><option value="replace">Replace conflicting weight records</option>
      </select></label>
      <label className="check"><input type="checkbox" checked={earliest} disabled={busy}
        onChange={event => { setEarliest(event.target.checked); setConfirmed(false) }} /> Use the earliest recorded weigh-in as my starting point</label>
      <label className="check"><input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} /> Confirm import in {unit}</label>
      <button className="primary self-start" disabled={!confirmed || !unit || busy} onClick={async () => {
        if (!unit) return
        setBusy(true)
        setError('')
        try {
          const count = await importWeights(db, preview.entries, unit, conflictPolicy === 'replace', earliest, today)
          done(count === 1 ? '1 weigh-in imported.' : count + ' weigh-ins imported.')
        } catch (error) { setError(error instanceof Error ? error.message : 'Import failed.') }
        finally { setBusy(false) }
      }}>Import weigh-ins</button>
    </div>}
  </section>
}
