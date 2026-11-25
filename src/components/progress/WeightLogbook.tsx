import { NotebookPen, Plus } from 'lucide-react'
import { formatDate } from '../../data/model'
import { activeAverage, milestoneJourney, showChange, weeklyRate } from '../../data/weight/calculations'
import { formatWeight, type WeightEntry, type WeightSettings } from '../../data/weight/model'

export function WeightLogbook({ entries, settings, onAdd, onEdit }: {
  entries: WeightEntry[]; settings: WeightSettings; onAdd: () => void; onEdit: (entry: WeightEntry) => void
}) {
  const { unit } = settings
  const months = new Map<string, WeightEntry[]>()
  for (const entry of entries.slice().reverse()) {
    const month = entry.date.slice(0, 7)
    const group = months.get(month)
    if (group) group.push(entry)
    else months.set(month, [entry])
  }
  const { achievements } = milestoneJourney(entries, settings)
  const milestonesByDate = new Map<string, string[]>()
  for (const { date, weight } of achievements) {
    const value = formatWeight(weight, unit) + ' ' + unit
    const group = milestonesByDate.get(date)
    if (group) group.push(value)
    else milestonesByDate.set(date, [value])
  }
  return <>
    <div className="row between">
      <h2>Logbook</h2>
      <button type="button" className="primary weight-add" aria-label="Add Weight" onClick={onAdd}>
        <Plus size={22} aria-hidden="true" />
      </button>
    </div>
    {!entries.length ? <section className="card empty"><h3>No weigh-ins yet</h3><p>Your entries will appear here by month.</p></section> : <>
      <label className="field weight-jump">Jump to month<select value="" onChange={event => {
        document.getElementById('weight-month-' + event.target.value)?.scrollIntoView({ block: 'start' })
      }}><option value="">Choose a month</option>
        {[...months.keys()].map(month => <option key={month} value={month}>
          {formatDate(month + '-01', { month: 'long', year: 'numeric' })}
        </option>)}
      </select></label>
      {[...months].map(([month, group]) => <section className="card stack weight-month" key={month} id={'weight-month-' + month}>
        <h2>{formatDate(month + '-01', { month: 'long', year: 'numeric' })}</h2>
        <div className="weight-log-grid weight-log-head"><span>Date</span><span>Recorded</span>
          <span>Moving Average</span><span>Weekly Rate</span></div>
        {group.map(entry => {
          const reached = milestonesByDate.get(entry.date) ?? []
          return <div key={entry.id}>
            {reached.length > 0 && <p className="weight-achievement">
              Milestone{reached.length > 1 ? 's' : ''} reached · {reached.join(', ')}
            </p>}
            <button className="weight-log-grid weight-log-row" onClick={() => onEdit(entry)}>
              <span><strong>{Number(entry.date.slice(8))}</strong>
                <small>{formatDate(entry.date, { weekday: 'short' })}
                  {entry.notes && <NotebookPen className="weight-note" size={13} aria-label="Has a note" />}</small></span>
              <span>{formatWeight(entry.recordedKg, unit)} <small>{unit}</small></span>
              <span>{formatWeight(activeAverage(entry), unit)} <small>{unit}</small>
                <small className="weight-average-source">{entry.useImportedTrend ? (entry.importedTrendStale ? 'Imported · edited' : 'Imported') : 'FitLog'}</small></span>
              <span>{showChange(weeklyRate(entries, entry.date), unit, true)}</span>
            </button>
          </div>
        })}
      </section>)}
    </>}
  </>
}
