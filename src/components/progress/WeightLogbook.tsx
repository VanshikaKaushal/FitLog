import { NotebookPen } from 'lucide-react'
import { formatDate } from '../../data/model'
import { activeAverage, milestoneJourney, showChange, weeklyRate } from '../../data/weight/calculations'
import { formatWeight, type WeightEntry, type WeightSettings } from '../../data/weight/model'

export function WeightLogbook({ entries, settings, onEdit }: {
  entries: WeightEntry[]; settings: WeightSettings; onEdit: (entry: WeightEntry) => void
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
  if (!entries.length) return <section className="card empty">
    <h2>No weigh-ins yet</h2><p>Your entries will appear here by month.</p>
  </section>

  return <>
    {[...months].map(([month, group]) => <section className="card stack weight-month" key={month}>
      <h2>{formatDate(month + '-01', { month: 'long', year: 'numeric' })}</h2>
      <div className="weight-log-grid weight-log-head"><span>Date</span><span>Weight</span>
        <span>Trend</span><span>Weekly Rate</span></div>
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
            <span className="weight-recorded"><strong>{formatWeight(entry.recordedKg, unit)}</strong> <small>{unit}</small></span>
            <span>{formatWeight(activeAverage(entry), unit)} <small>{unit}</small></span>
            <span>{showChange(weeklyRate(entries, entry.date), unit, true)}</span>
          </button>
        </div>
      })}
    </section>)}
  </>
}
