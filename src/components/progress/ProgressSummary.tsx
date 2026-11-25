import { useState } from 'react'
import { Check } from 'lucide-react'
import { formatDate } from '../../data/model'
import {
  directionLabel, milestoneJourney, overallRate, predictMilestone, showChange, trackingWeight, trendChanges, weeklyRate,
} from '../../data/weight/calculations'
import { formatWeight, type WeightEntry, type WeightSettings } from '../../data/weight/model'

const scenarios = ['Commitment', 'Current Rate', 'Overall Rate'] as const

export function ProgressSummary({ entries, settings, today }: {
  entries: WeightEntry[]; settings: WeightSettings; today: string
}) {
  const [scenario, setScenario] = useState(0)
  const { unit } = settings
  const latest = entries.at(-1)
  const journey = milestoneJourney(entries, settings)
  const tracking = latest ? trackingWeight(latest, settings.tracking) : null
  const format = (value: number) => formatWeight(value, unit)
  const trackingLabel = settings.tracking === 'average' ? 'Moving average' : 'Recorded weight'
  const eligible = !latest || !settings.startDate || latest.date >= settings.startDate
  const goalMet = settings.goal && tracking !== null && eligible &&
    (settings.objective === 'lose' ? tracking <= settings.goal.highKg
      : settings.objective === 'gain' ? tracking >= settings.goal.lowKg
      : tracking >= settings.goal.lowKg && tracking <= settings.goal.highKg)
  const complete = journey.complete || !!goalMet
  const fraction = complete ? 1 : journey.fraction
  const rates = [
    settings.commitmentKg === null || settings.objective === 'maintain' ? null
      : settings.commitmentKg * (settings.objective === 'lose' ? -1 : 1),
    latest ? weeklyRate(entries, latest.date) : null,
    overallRate(settings, latest),
  ]
  const forecast = entries.length > 1 && !complete
    ? predictMilestone(latest, settings, journey.next, rates[scenario], today) : null

  return <>
    <section className="card stack weight-progress">
      <h2>Weight Progress</h2>
      <div className="weight-ring">
        <svg aria-hidden="true" viewBox="0 0 180 180">
          <circle className="weight-ring-track" cx="90" cy="90" r="78" />
          {fraction > 0 && <circle className="weight-ring-fill" cx="90" cy="90" r="78" pathLength="100"
            strokeDasharray={fraction === 1 ? undefined : fraction * 100 + ' 100'} />}
        </svg>
        <div className="weight-ring-label">
          <span>{complete ? 'Goal reached' : journey.next !== null ? 'Milestone ' + (journey.achievements.length + 1) : 'Tracking weight'}</span>
          <strong>{journey.next !== null && !complete ? format(journey.next) : tracking !== null ? format(tracking) : '—'}</strong>
          <span>{unit}</span>
        </div>
      </div>
      {latest && tracking !== null ? <dl className="weight-facts">
        <div><dt>Latest weigh-in</dt><dd>{formatDate(latest.date)}</dd></div>
        <div><dt>{trackingLabel}</dt><dd>{format(tracking)} {unit}</dd></div>
        {journey.boundaries.length > 0 && <div><dt>{complete ? 'Milestone journey' : 'Current milestone'}</dt>
          <dd>{complete ? 'Complete' : Math.round(fraction * 100) + '% complete'}</dd></div>}
        {!complete && journey.remaining !== null && <div><dt>To next milestone</dt><dd>{format(journey.remaining)} {unit}</dd></div>}
      </dl> : <p>Log a weigh-in to start tracking your weight.</p>}
      {journey.boundaries.length > 0 && <>
        <div className="weight-dots" aria-label="Milestone journey">
          {journey.boundaries.map((weight, index) => {
            const achievement = journey.achievements[index]
            const segment = achievement ? 100 : index === journey.achievements.length ? fraction * 100 : 0
            const label = format(weight) + ' ' + unit + (achievement ? ' · Reached ' + formatDate(achievement.date) : '')
            return <div className="weight-dot-segment" key={weight} title={label}>
              <span className="weight-dot-line" aria-hidden="true"><i style={{ width: segment + '%' }} /></span>
              <span className={'weight-dot' + (achievement ? ' reached' : '')} role="img" aria-label={label}>
                {achievement && <Check size={11} strokeWidth={3} aria-hidden="true" />}
              </span>
            </div>
          })}
        </div>
        <p>{journey.achievements.length} of {journey.boundaries.length} milestones completed.</p>
      </>}
      {settings.milestones && !journey.boundaries.length && !complete &&
        <p>A starting point, a goal in your chosen direction, and a milestone increment are needed.</p>}
    </section>

    <section className="card stack">
      <h2>Weight Trends</h2>
      <p>{trackingLabel}{latest ? ' through ' + formatDate(latest.date) : ''}</p>
      <div className="weight-trends">
        {trendChanges(entries, settings.tracking).map(({ days, change }) => <div className="previous" key={days ?? 'all'}>
          <strong>{days ? 'Last ' + days + ' days' : 'All time'}</strong>
          <span>{change === null ? 'Insufficient data' : showChange(change, unit)}</span>
          {change !== null && <small>{directionLabel(change, unit)}</small>}
        </div>)}
      </div>
    </section>

    {settings.predictions && <section className="card stack">
      <h2>Predictions</h2>
      <div className="nutrition-segments" aria-label="Prediction rate">
        {scenarios.map((item, index) => <button key={item} aria-pressed={index === scenario}
          onClick={() => setScenario(index)}>{item}<small>{showChange(rates[index], unit, true)}</small></button>)}
      </div>
      {forecast && journey.next !== null ? <div className="previous stack">
        <h3>{format(journey.next)} {unit} · {formatDate(forecast.date)}</h3>
        <p>{forecast.daysFromToday === 0 ? 'Estimated for today'
          : forecast.daysFromToday > 0 ? 'About ' + forecast.daysFromToday + ' days from now'
          : 'Estimated date was about ' + Math.abs(forecast.daysFromToday) + ' days ago'}</p>
        <p>Based on the {formatDate(forecast.basedOn)} weigh-in.</p>
      </div> : <p>{complete ? 'Goal reached.' : 'An estimate is unavailable for this rate and milestone.'}</p>}
      <p>Dates are mathematical estimates. They can change as weigh-ins are added.</p>
    </section>}
  </>
}
