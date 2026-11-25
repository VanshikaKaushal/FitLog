import { formatNutrient, nutrients, type Nutrition } from '../../data/nutrition'

import type { NutrientFields } from './nutrientFields'

export function NutritionFields({ fields, change }: {
  fields: NutrientFields
  change: (fields: NutrientFields) => void
}) {
  return <div className="option-grid">
    {nutrients.map(({ key, label, unit }) => <label className="field" key={key}>
      {label} ({unit})
      <input type="number" inputMode="decimal" min="0" step="any" required={key === 'calories'}
        placeholder={key === 'calories' ? undefined : 'Unknown'} value={fields[key]}
        onChange={event => change({ ...fields, [key]: event.target.value })} />
    </label>)}
  </div>
}

export function NutritionValues({ nutrition }: { nutrition: Nutrition }) {
  return <dl className="nutrition-values">{nutrients.map(({ key, short, unit }) => {
    const value = nutrition[key]
    return <div key={key}><dt>{short}</dt><dd>{value === null ? 'Unknown' : formatNutrient(value, key) + ' ' + unit}</dd></div>
  })}</dl>
}

export function FoodSource({ source, verified }: { source: string; verified: boolean }) {
  return <p className="food-source"><span className="badge">{verified ? 'Verified' : 'Estimated'}</span>
    {source && <span>{source}</span>}
  </p>
}

export function SourceFields({ source, verified, change }: {
  source: string
  verified: boolean
  change: (source: string, verified: boolean) => void
}) {
  return <div className="option-grid">
    <label className="field">Nutrition source<input value={source} placeholder="e.g. Package label"
      onChange={event => change(event.target.value, verified)} /></label>
    <label className="field">Nutrition status<select value={verified ? 'verified' : 'estimated'}
      onChange={event => change(source, event.target.value === 'verified')}>
      <option value="estimated">Estimated</option><option value="verified">Verified</option>
    </select></label>
  </div>
}
