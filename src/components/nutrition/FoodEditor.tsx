import { useState } from 'react'
import { db } from '../../data/db'
import { units, type Food, type Unit } from '../../data/nutrition'
import { saveFood } from '../../data/nutritionStore'
import { NutritionFields, SourceFields } from './NutritionFields'

import { nutrientFields, parseNutrients } from './nutrientFields'

export function FoodEditor({ food, duplicate, onClose }: {
  food?: Food
  duplicate?: boolean
  onClose: () => void
}) {
  const [name, setName] = useState(food ? food.name + (duplicate ? ' (copy)' : '') : '')
  const [brand, setBrand] = useState(food?.brand ?? '')
  const [category, setCategory] = useState(food?.category ?? '')
  const [quantity, setQuantity] = useState(String(food?.serving.quantity ?? 1))
  const [unit, setUnit] = useState<Unit>(food?.serving.unit ?? 'servings')
  const [values, setValues] = useState(() => nutrientFields(food?.serving.nutrition))
  const [notes, setNotes] = useState(food?.notes ?? '')
  const [source, setSource] = useState(food?.source ?? '')
  const [verified, setVerified] = useState(food?.verified ?? false)
  const [favorite, setFavorite] = useState(food?.favorite ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function run(task: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try { await task(); onClose() } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this food.')
    } finally { setBusy(false) }
  }

  return <form className="card stack" onSubmit={event => {
    event.preventDefault()
    void run(() => saveFood(db, { name, brand, category, serving: {
      quantity: Number(quantity), unit, nutrition: parseNutrients(values),
    }, notes, source, verified, favorite }, duplicate ? undefined : food?.id))
  }}>
    <div className="row between wrap"><h2>{food && !duplicate ? 'Edit food' : 'New saved food'}</h2>
      <button type="button" className="text-button" disabled={busy} onClick={onClose}>Cancel</button>
    </div>
    <fieldset disabled={busy} className="stack">
      <label className="field">Food name<input required value={name} onChange={event => setName(event.target.value)} /></label>
      <div className="option-grid">
        <label className="field">Brand<input value={brand} onChange={event => setBrand(event.target.value)} /></label>
        <label className="field">Category<input value={category} onChange={event => setCategory(event.target.value)} /></label>
      </div>
      <div className="option-grid">
        <label className="field">Reference quantity<input required type="number" inputMode="decimal" step="any"
          min="0" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
        <label className="field">Serving unit<select value={unit} onChange={event => setUnit(event.target.value as Unit)}>
          {units.map(unit => <option key={unit}>{unit}</option>)}
        </select></label>
      </div>
      <p>Enter nutrition for the reference serving above. Leave unknown nutrients blank.</p>
      <NutritionFields fields={values} change={setValues} />
      <SourceFields source={source} verified={verified} change={(source, verified) => { setSource(source); setVerified(verified) }} />
      <label className="field">Notes<textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={favorite} onChange={event => setFavorite(event.target.checked)} />
        Mark as favorite
      </label>
      {error && <p role="alert" className="danger">{error}</p>}
      <div className="row wrap">
        <button className="primary" type="submit">Save food</button>
        {food && !duplicate && <button type="button" className="text-button danger" onClick={() => setDeleting(true)}>Delete food</button>}
      </div>
      {deleting && food && <div className="previous stack">
        <p>Delete this saved food? Existing diary entries will be kept.</p>
        <div className="row wrap">
          <button type="button" className="secondary danger" onClick={() => void run(() => db.foods.delete(food.id))}>Confirm deletion</button>
          <button type="button" className="text-button" onClick={() => setDeleting(false)}>Keep food</button>
        </div>
      </div>}
    </fieldset>
  </form>
}
