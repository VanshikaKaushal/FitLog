import { useState } from 'react'
import { Settings2, Sparkles, Trash2 } from 'lucide-react'
import type { Exercise, SetEntry } from '../data/model'

interface NumberFieldProps {
  label: string
  value: number | null
  integer?: boolean
  onChange: (value: number | null) => void
}

function NumberField({ label, value, integer, onChange }: NumberFieldProps) {
  const [rawValue, setRawValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [invalid, setInvalid] = useState(false)
  return <label className="field numeric">
    <span>{label}</span>
    <input inputMode={integer ? 'numeric' : 'decimal'} value={focused ? rawValue : value ?? ''}
      onFocus={() => { setRawValue(String(value ?? '')); setFocused(true) }} placeholder="—" aria-invalid={invalid}
      onChange={event => {
        setRawValue(event.currentTarget.value)
        const raw = event.currentTarget.value.trim().replace(',', '.')
        const number = Number(raw)
        const valid = !raw || ((integer ? /^\d+$/ : /^(?:\d+(?:\.\d{0,4})?|\.\d{1,4})$/).test(raw)
          && number <= 1000000)
        setInvalid(!valid)
        if (valid) onChange(raw ? number : null)
      }}
      onBlur={() => {
        setFocused(false)
        setInvalid(false)
      }} />
    {invalid && <small role="alert">Enter a valid {integer ? 'whole number' : 'number (up to 4 decimals)'}.</small>}
  </label>
}

export function SetEditor({ set, index, exercise, update, remove, badges }: {
  set: SetEntry
  index: number
  exercise: Exercise
  update: (change: Partial<SetEntry>) => void
  remove: () => void
  badges: string[]
}) {
  const [expanded, setExpanded] = useState(false)
  const weightKey = set.mode === 'assisted' ? 'assistance' : 'weight'
  return <div className="set">
    <div className="set-row" role="group" aria-label={'Set ' + (index + 1)}>
      <span className="set-index">{index + 1}</span>
      {set.mode !== 'bodyweight' && <NumberField key={weightKey}
        label={(set.mode === 'assisted' ? 'Assist' : 'Weight') + ' (' + set.unit + ')'}
        value={set[weightKey]} onChange={value => update({ [weightKey]: value })} />}
      <NumberField label={exercise.measure === 'seconds' ? 'Seconds' : 'Reps'}
        value={set.amount} integer={exercise.measure === 'reps'} onChange={amount => update({ amount })} />
      <button className="icon-button" aria-label={'Set ' + (index + 1) + ' options'} aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}><Settings2 size={18} /></button>
    </div>
    {(set.scope !== 'total' || set.mode !== 'weight' || set.plates || set.notes) &&
      <p className="set-meta">{[
        set.mode === 'bodyweight' ? 'Bodyweight' : set.mode === 'assisted' ? 'Assisted' : '',
        set.scope === 'per-side' ? 'Per side' : set.scope === 'unknown' ? 'Scope unknown' : '',
        set.plates ? 'Base ' + (set.plates.base ?? '—') + ' + plates ' + (set.plates.added ?? '—') + ' ' + set.unit : '',
        set.notes,
      ].filter(Boolean).join(' · ')}</p>}
    {!!badges.length && <div className="set-meta">{badges.map(badge => <span className="badge record-badge" key={badge}><Sparkles size={14} aria-hidden="true" />{badge}</span>)}</div>}
    {expanded && <div className="set-options">
      <div className="option-grid">
        <label className="field">Load type
          <select value={set.mode} onChange={event => update({ mode: event.target.value as SetEntry['mode'] })}>
            <option value="weight">External weight</option><option value="bodyweight">Bodyweight</option>
            <option value="assisted">Assisted</option>
          </select>
        </label>
        {set.mode !== 'bodyweight' && <>
          <label className="field">Unit
            <select value={set.unit} onChange={event => update({ unit: event.target.value as SetEntry['unit'] })}>
              <option value="lb">lb</option><option value="kg">kg</option>
            </select>
          </label>
          <label className="field">Weight scope
            <select value={set.scope} onChange={event => update({ scope: event.target.value as SetEntry['scope'] })}>
              <option value="total">Total</option><option value="per-side">Per side</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
        </>}
      </div>
      {set.mode === 'weight' && <label className="check">
        <input type="checkbox" checked={!!set.plates} onChange={event => update({
          plates: event.target.checked ? { base: null, added: null } : undefined,
        })} /> Record base weight and plates
      </label>}
      {set.mode === 'weight' && set.plates && <div className="option-grid">
        <NumberField label={'Base (' + set.unit + ')'} value={set.plates.base}
          onChange={base => update({ plates: { base, added: set.plates?.added ?? null } })} />
        <NumberField label={'Added plates (' + set.unit + ')'} value={set.plates.added}
          onChange={added => update({ plates: { base: set.plates?.base ?? null, added } })} />
      </div>}
      <label className="field">Set notes<input value={set.notes} onChange={event => update({ notes: event.target.value })} /></label>
      <button className="text-button danger" onClick={remove}><Trash2 size={16} /> Remove set</button>
    </div>}
  </div>
}
