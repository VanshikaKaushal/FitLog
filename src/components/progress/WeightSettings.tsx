import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { db } from '../../data/db'
import { downloadBackup } from '../../data/backup'
import { formatDate } from '../../data/model'
import { maxMilestones, milestonesFor } from '../../data/weight/calculations'
import { weightCsv } from '../../data/weight/csv'
import {
  fromKg, toKg, validWeight, type Objective, type WeightEntry, type WeightSettings as Settings, type WeightUnit,
} from '../../data/weight/model'
import { changeWeightUnit, recalculateStaleTrends, saveWeightSettings } from '../../data/weight/store'

export function WeightSettings({ settings, entries, today, openImport, openBackup, onEditing }: {
  settings: Settings; entries: WeightEntry[]; today: string
  openImport: () => void; openBackup: () => void; onEditing: (editing: boolean) => void
}) {
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [exportUnit, setExportUnit] = useState<WeightUnit | null>(null)
  const unit = exportUnit ?? settings.unit
  const stale = entries.some(entry => entry.importedTrendStale && entry.useImportedTrend)

  async function run(task: () => Promise<unknown>, success = '') {
    setBusy(true)
    onEditing(true)
    setError('')
    setMessage('')
    try { await task(); setMessage(success) } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update weight data.')
    } finally { setBusy(false); onEditing(dirty) }
  }

  function exportFile(share: boolean) {
    const file = new File([weightCsv(entries, unit)], 'fitlog-weight-' + unit + '-' + today + '.csv', { type: 'text/csv' })
    if (share && navigator.canShare?.({ files: [file] })) {
      void navigator.share({ files: [file], title: 'FitLog weight history' }).catch(error => {
        if (error.name !== 'AbortError') setError('Sharing did not finish. Use Download CSV to save a copy.')
      })
    } else downloadBackup(file)
  }

  return <>
    <section className="card stack">
      <h2>Weight Units</h2>
      <label className="field">Display unit<select value={settings.unit} disabled={busy || dirty} onChange={event => {
        const selected = event.target.value as WeightUnit
        void run(() => changeWeightUnit(db, selected), 'Display unit updated.')
      }}><option value="lb">Pounds (lb)</option><option value="kg">Kilograms (kg)</option></select></label>
      {dirty && <p>Save or discard goal changes to switch units.</p>}
    </section>
    <GoalEditor key={JSON.stringify(settings)} settings={settings} today={today} earliest={entries[0]}
      onDirty={value => { setDirty(value); onEditing(value) }} />
    <section className="card stack">
      <h2>Data and Backup</h2>
      <p>Your weight history is stored on this device. Keep a complete JSON backup to recover notes, settings, and imported averages.</p>
      <button className="secondary self-start" disabled={busy || dirty} onClick={openImport}><Upload size={17} /> Import Happy Scale CSV</button>
      {stale && <div className="previous stack"><p>Some imported trends reflect weigh-ins that have since changed.</p>
        <button className="secondary self-start" disabled={busy || dirty}
          onClick={() => void run(() => recalculateStaleTrends(db), 'Affected FitLog trends recalculated. Original averages were kept.')}>
          Recalculate affected FitLog trends
        </button>
      </div>}
      <label className="field">CSV export unit<select value={unit} onChange={event => setExportUnit(event.target.value as WeightUnit)}>
        <option value="lb">Pounds (lb)</option><option value="kg">Kilograms (kg)</option>
      </select></label>
      <div className="row wrap">
        <button className="secondary" disabled={!entries.length} onClick={() => exportFile(true)}>
          <Download size={17} /> Export or share CSV
        </button>
        <button className="text-button" disabled={!entries.length} onClick={() => exportFile(false)}>Download CSV</button>
      </div>
      <button className="secondary self-start" disabled={busy || dirty} onClick={openBackup}>Complete FitLog backup</button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="danger">{error}</p>}
    </section>
  </>
}

function GoalEditor({ settings, today, earliest, onDirty }: {
  settings: Settings; today: string; earliest?: WeightEntry; onDirty: (dirty: boolean) => void
}) {
  const display = (value: number | null, unit = settings.unit) => value === null ? '' : String(fromKg(value, unit))
  function initialDraft() {
    return {
      objective: settings.objective, startDate: settings.startDate ?? '', start: display(settings.startKg),
      goalType: !settings.goal ? 'none' : settings.goal.lowKg === settings.goal.highKg ? 'single' : 'range',
      low: display(settings.goal?.lowKg ?? null), high: display(settings.goal?.highKg ?? null),
      commitment: display(settings.commitmentKg), increment: display(settings.incrementKg),
      tracking: settings.tracking, milestones: settings.milestones, predictions: settings.predictions,
    }
  }
  const [draft, setDraft] = useState(initialDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  const { unit } = settings

  function edit(change: Partial<typeof draft>) {
    setDraft(current => ({ ...current, ...change }))
    setDirty(true)
    onDirty(true)
    setMessage('')
  }

  function value(text: string, original: number | null) {
    if (!text.trim()) return null
    return text === display(original) ? original : toKg(Number(text), unit)
  }

  function input(label: string, key: 'start' | 'low' | 'high' | 'commitment' | 'increment', required = false) {
    return <label className="field">{label} ({unit})<input type="number" min="0" step="any" inputMode="decimal"
      value={draft[key]} required={required} onChange={event => edit({ [key]: event.target.value })} /></label>
  }

  return <form className="card stack" onSubmit={async event => {
    event.preventDefault()
    setError('')
    setMessage('')
    const low = value(draft.low, settings.goal?.lowKg ?? null)
    const high = draft.goalType === 'single' ? low : value(draft.high, settings.goal?.highKg ?? null)
    if (draft.goalType !== 'none' && (!validWeight(low) || !validWeight(high) || high < low)) {
      setError('Enter a positive goal or a range from lower to higher weight.')
      return
    }
    const next: Settings = {
      ...settings, objective: draft.objective, startDate: draft.startDate || null, startKg: value(draft.start, settings.startKg),
      goal: draft.goalType === 'none' || low === null || high === null ? null : { lowKg: low, highKg: high },
      commitmentKg: draft.objective === 'maintain' ? null : value(draft.commitment, settings.commitmentKg),
      incrementKg: value(draft.increment, settings.incrementKg),
      incrementUnit: draft.increment === display(settings.incrementKg) ? settings.incrementUnit : unit,
      tracking: draft.tracking, milestones: draft.objective !== 'maintain' && draft.milestones, predictions: draft.predictions,
    }
    if (next.milestones) {
      if (!next.startDate || !next.startKg || !next.goal || !next.incrementKg) {
        setError('Add a starting point, goal, and increment to enable milestones.')
        return
      }
      const target = next.objective === 'lose' ? next.goal.highKg : next.goal.lowKg
      const pointsTowardGoal = next.objective === 'lose' ? target < next.startKg : target > next.startKg
      if (pointsTowardGoal && !milestonesFor(next).length) {
        setError('Choose a milestone increment that creates at most ' + maxMilestones + ' milestones.')
        return
      }
    }
    setBusy(true)
    try {
      await saveWeightSettings(db, next)
      setDirty(false)
      onDirty(false)
      setMessage('Weight goals saved.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save weight goals.')
    } finally { setBusy(false) }
  }}>
    <h2>Weight Goals</h2>
    <fieldset className="stack" disabled={busy}>
      <label className="field">Objective<select value={draft.objective} onChange={event => edit({ objective: event.target.value as Objective })}>
        <option value="lose">Lose weight</option><option value="maintain">Maintain weight</option><option value="gain">Gain weight</option>
      </select></label>
      <div className="option-grid weight-form-grid">
        <label className="field">Starting date<input type="date" max={today} value={draft.startDate}
          onChange={event => edit({ startDate: event.target.value })} /></label>
        {input('Starting weight', 'start')}
      </div>
      {earliest && <button type="button" className="text-button self-start" onClick={() =>
        edit({ startDate: earliest.date, start: display(earliest.recordedKg) })}>
        Use earliest weigh-in · {formatDate(earliest.date, { month: 'short', day: 'numeric', year: 'numeric' })}
      </button>}
      <label className="field">Goal type<select value={draft.goalType} onChange={event => edit({ goalType: event.target.value })}>
        <option value="none">No goal</option><option value="single">Single weight</option><option value="range">Weight range</option>
      </select></label>
      {draft.goalType === 'single' && input('Goal weight', 'low', true)}
      {draft.goalType === 'range' && <div className="option-grid">{input('Lower weight', 'low', true)}{input('Upper weight', 'high', true)}</div>}
      {draft.objective !== 'maintain' && <div className="option-grid">
        {input('Weekly commitment', 'commitment')}{input('Milestone increment', 'increment')}
      </div>}
      <label className="field">Track using<select value={draft.tracking} onChange={event => edit({ tracking: event.target.value as Settings['tracking'] })}>
        <option value="average">Moving average</option><option value="recorded">Recorded weight</option></select>
      </label>
      {draft.objective !== 'maintain' && <label className="check"><input type="checkbox" checked={draft.milestones}
        onChange={event => edit({ milestones: event.target.checked })} /> Track milestones</label>}
      <label className="check"><input type="checkbox" checked={draft.predictions}
        onChange={event => edit({ predictions: event.target.checked })} /> Show predictions</label>
      {error && <p role="alert" className="danger">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="row wrap">
        <button className="primary" disabled={!dirty}>Save weight goals</button>
        {dirty && <button type="button" className="text-button" onClick={() => {
          setDraft(initialDraft()); setDirty(false); onDirty(false); setError('')
        }}>Discard changes</button>}
      </div>
    </fieldset>
  </form>
}
