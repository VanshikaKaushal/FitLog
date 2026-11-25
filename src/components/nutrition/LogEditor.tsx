import { useState } from 'react'
import { Search } from 'lucide-react'
import { db } from '../../data/db'
import {
  emptyNutrition, isQuantity, meals, scaledNutrition,
  type Food, type FoodDraft, type FoodLogEntry, type Meal, type Serving,
} from '../../data/nutrition'
import { saveLog } from '../../data/nutritionStore'
import { FoodSource, NutritionFields, NutritionValues, SourceFields } from './NutritionFields'

const modes = ['Quick Add', 'Saved Food', 'Recently Eaten'] as const

import { nutrientFields, parseNutrients } from './nutrientFields'

export function LogEditor({ date, meal, foods, recent, entry, initialFood, onClose }: {
  date: string
  meal: Meal
  foods: Food[]
  recent: FoodLogEntry[]
  entry?: FoodLogEntry
  initialFood?: Food
  onClose: (date?: string) => void
}) {
  const [mode, setMode] = useState<typeof modes[number]>(initialFood ? 'Saved Food' : 'Quick Add')
  const [selected, setSelected] = useState<Food | null>(initialFood ?? null)
  const [reference, setReference] = useState<Serving | null>(entry?.reference ?? initialFood?.serving ?? null)
  const [foodId, setFoodId] = useState(entry?.foodId ?? initialFood?.id ?? null)
  const [name, setName] = useState(entry?.name ?? initialFood?.name ?? '')
  const [quantity, setQuantity] = useState(() => {
    const last = initialFood && recent.find(item => item.foodId === initialFood.id && item.unit === initialFood.serving.unit)
    return String(entry?.quantity ?? last?.quantity ?? initialFood?.serving.quantity ?? '')
  })
  const [description, setDescription] = useState(entry?.description ?? '')
  const [values, setValues] = useState(() => nutrientFields(entry?.nutrition))
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [source, setSource] = useState(entry?.source ?? initialFood?.source ?? '')
  const [verified, setVerified] = useState(entry?.verified ?? initialFood?.verified ?? false)
  const [logDate, setDate] = useState(entry?.date ?? date)
  const [logMeal, setMeal] = useState(entry?.meal ?? meal)
  const [saveToLibrary, setSaveToLibrary] = useState(false)
  const [query, setQuery] = useState('')
  const [hasChoice, setHasChoice] = useState(!!initialFood)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const editableNutrition = !reference && (mode === 'Quick Add' || !!entry)
  const normalizedQuery = query.trim().toLowerCase()
  let preview = null
  if (reference && isQuantity(Number(quantity))) {
    try { preview = scaledNutrition(reference, Number(quantity)) } catch { /* Save surfaces the validation message. */ }
  }

  function pickFood(food: Food) {
    setSelected(food)
    setReference(food.serving)
    setFoodId(food.id)
    setName(food.name)
    const last = recent.find(item => item.foodId === food.id && item.unit === food.serving.unit)
    setQuantity(String(last?.quantity ?? food.serving.quantity))
    setDescription('')
    setNotes('')
    setSource(food.source)
    setVerified(food.verified)
    setHasChoice(true)
  }

  function pickRecent(item: FoodLogEntry) {
    setSelected(null)
    const serving = item.reference ?? { quantity: 1, unit: 'servings', nutrition: item.nutrition } as const
    setReference(serving)
    setFoodId(item.foodId)
    setName(item.name)
    setQuantity(String(item.reference ? item.quantity ?? serving.quantity : 1))
    setDescription(item.description)
    setNotes(item.notes)
    setSource(item.source)
    setVerified(item.verified)
    setHasChoice(true)
  }

  function switchMode(next: typeof modes[number]) {
    setMode(next)
    setHasChoice(false)
    setSelected(null)
    setReference(null)
    setFoodId(null)
    setName('')
    setDescription('')
    setNotes('')
    setSource('')
    setVerified(false)
    setSaveToLibrary(false)
    setQuery('')
  }

  async function run(task: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try { await task(); onClose(logDate) } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this entry.')
    } finally { setBusy(false) }
  }

  return <form className="card stack" onSubmit={event => {
    event.preventDefault()
    void run(async () => {
      const nutrition = editableNutrition ? parseNutrients(values) : preview ?? emptyNutrition
      const libraryFood: FoodDraft | undefined = saveToLibrary && !entry && mode === 'Quick Add' ? {
        name, brand: '', category: '', serving: { quantity: 1, unit: 'servings', nutrition },
        notes: [description, notes].filter(Boolean).join(' · '), source, verified, favorite: false,
      } : undefined
      await saveLog(db, { date: logDate, meal: logMeal, name, foodId, description, nutrition,
        quantity: reference ? Number(quantity) : null, unit: reference?.unit ?? null, reference,
        source, verified, notes }, entry?.id, libraryFood)
    })
  }}>
    <div className="row between wrap"><h2>{entry ? 'Food entry' : 'Add food'}</h2>
      <button type="button" className="text-button" disabled={busy} onClick={() => onClose()}>Cancel</button>
    </div>
    <fieldset disabled={busy} className="stack">
      {!entry && <div className="nutrition-segments" aria-label="Add food method">
        {modes.map(item => <button key={item} type="button" aria-pressed={mode === item} onClick={() => {
          if (item !== mode) switchMode(item)
        }}>{item}</button>)}
      </div>}
      {!entry && mode === 'Saved Food' && <>
        <label className="search"><Search size={18} aria-hidden="true" />
          <input aria-label="Find a saved food" placeholder="Search My Foods" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="exercise-list">{foods.filter(food =>
          [food.name, food.brand, food.category].join(' ').toLowerCase().includes(normalizedQuery)).map(food =>
          <button type="button" className="exercise-option" key={food.id} aria-pressed={selected?.id === food.id}
            onClick={() => pickFood(food)}><span><strong>{food.name}</strong>{food.brand && <small>{food.brand}</small>}</span>
            <small>{food.serving.nutrition.calories.toLocaleString(undefined, { maximumFractionDigits: 0 })} kcal</small></button>)}</div>
        {!foods.length && <p>Add a food in My Foods or use Quick Add.</p>}
        {!!foods.length && !foods.some(food => [food.name, food.brand, food.category].join(' ').toLowerCase().includes(normalizedQuery))
          && <p>No saved foods match this search.</p>}
      </>}
      {!entry && mode === 'Recently Eaten' && <div className="exercise-list">
        {recent.map(item => <button type="button" className="exercise-option" key={item.id}
          onClick={() => pickRecent(item)}><span><strong>{item.name}</strong>
            <small>{item.quantity === null ? item.description || '1 serving' : item.quantity + ' ' + item.unit}</small></span></button>)}
        {!recent.length && <p className="nutrition-list-empty">Recently logged foods will appear here.</p>}
      </div>}
      {(entry || mode === 'Quick Add' || hasChoice) && <>
        <label className="field">Food name<input required value={name} onChange={event => setName(event.target.value)} /></label>
        <div className="option-grid nutrition-form-grid">
          <label className="field">Meal<select value={logMeal} onChange={event => setMeal(event.target.value as Meal)}>
            {meals.map(meal => <option key={meal}>{meal}</option>)}
          </select></label>
          <label className="field">Date<input required type="date" value={logDate} onChange={event => setDate(event.target.value)} /></label>
        </div>
        {reference ? <>
          <label className="field">Amount consumed ({reference.unit})
            <input required type="number" inputMode="decimal" min="0" step="any" value={quantity}
              onChange={event => setQuantity(event.target.value)} />
          </label>
          {preview && <div className="previous stack" aria-live="polite"><h3>Nutrition for this amount</h3>
            <NutritionValues nutrition={preview} /><FoodSource source={source} verified={verified} />
          </div>}
        </> : <>
          <label className="field">Quantity or serving description<input value={description} placeholder="Optional"
            onChange={event => setDescription(event.target.value)} /></label>
          {entry && <NutritionValues nutrition={entry.nutrition} />}
          <NutritionFields fields={values} change={setValues} />
        </>}
        <SourceFields source={source} verified={verified} change={(source, verified) => { setSource(source); setVerified(verified) }} />
        <label className="field">Notes<textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} /></label>
        {!entry && mode === 'Quick Add' && <label className="check"><input type="checkbox" checked={saveToLibrary}
          onChange={event => setSaveToLibrary(event.target.checked)} /> Save to My Foods as one serving</label>}
        {error && <p className="danger" role="alert">{error}</p>}
        <div className="row wrap">
          <button type="submit" className="primary" disabled={!!reference && !preview}>{entry ? 'Save changes' : 'Log food'}</button>
          {entry && <button type="button" className="text-button danger" onClick={() => setDeleting(true)}>Delete entry</button>}
        </div>
        {deleting && entry && <div className="previous stack">
          <p>Remove this food from the diary?</p>
          <div className="row wrap">
            <button type="button" className="secondary danger" onClick={() => void run(() => db.foodLogs.delete(entry.id))}>Confirm deletion</button>
            <button type="button" className="text-button" onClick={() => setDeleting(false)}>Keep entry</button>
          </div>
        </div>}
      </>}
    </fieldset>
  </form>
}
