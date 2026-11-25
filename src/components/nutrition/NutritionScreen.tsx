import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Search, Star } from 'lucide-react'
import { db } from '../../data/db'
import { formatDate, localDate } from '../../data/model'
import {
  formatNutrient, isCalendarDate, meals, nutrients, shiftDay, summarize,
  type Food, type FoodLogEntry, type Meal,
} from '../../data/nutrition'
import { copyMeal } from '../../data/nutritionStore'
import { FoodEditor } from './FoodEditor'
import { LogEditor } from './LogEditor'
import { FoodSource } from './NutritionFields'

const sections = ['Daily Log', 'History', 'My Foods'] as const
type Section = typeof sections[number]
type Panel =
  | { type: 'log'; meal: Meal; entry?: FoodLogEntry; initialFood?: Food }
  | { type: 'food'; food?: Food; duplicate?: boolean }
  | { type: 'copy'; meal: Meal }

function DatePicker({ date, label, select }: { date: string; label: string; select: (date: string) => void }) {
  return <label className="field nutrition-calendar">
    <span className="sr-only">{label}</span>
    <input type="date" value={date} onChange={event => {
      if (isCalendarDate(event.target.value)) select(event.target.value)
    }} />
  </label>
}

function DayTotals({ entries, compact = false }: { entries: FoodLogEntry[]; compact?: boolean }) {
  const { totals, incomplete, known } = summarize(entries)
  return <>
    <div className={compact ? 'nutrition-history-kcal' : 'nutrition-kcal'}>
      {!compact && <p>Total calories consumed</p>}
      <strong>{formatNutrient(totals.calories, 'calories')} <span>kcal</span></strong>
    </div>
    <dl className="nutrition-macros">
      {nutrients.slice(1).map(({ key, short }) => <div key={key}>
        <dt>{short}</dt><dd>{!entries.length || known.has(key) ? formatNutrient(totals[key], key) + ' g' : '—'}</dd>
        {incomplete.has(key) && <small>Incomplete</small>}
      </div>)}
    </dl>
  </>
}

function CopyMealEditor({ meal, date, logs, onClose }: {
  meal: Meal; date: string; logs: FoodLogEntry[]; onClose: () => void
}) {
  const [from, setFrom] = useState(meal)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dates = [...new Set(logs.filter(entry => entry.date < date && entry.meal === from).map(entry => entry.date))]
    .sort((a, b) => b.localeCompare(a))
  const source = dates.includes(selected) ? selected : dates[0] ?? ''
  const entries = logs.filter(entry => entry.date === source && entry.meal === from)

  return <form className="card stack" onSubmit={async event => {
    event.preventDefault()
    if (!source || busy) return
    setBusy(true)
    try {
      const count = await copyMeal(db, source, from, date, meal)
      if (!count) throw new Error('No entries are available for that meal.')
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not copy this meal.')
    } finally { setBusy(false) }
  }}>
    <div className="row between wrap"><h2>Copy previous meal</h2>
      <button className="text-button" type="button" disabled={busy} onClick={onClose}>Cancel</button>
    </div>
    <p>Copy entries into {meal.toLowerCase()} on {formatDate(date)}.</p>
    <label className="field">Source meal<select disabled={busy} value={from} onChange={event => setFrom(event.target.value as Meal)}>
      {meals.map(item => <option key={item}>{item}</option>)}
    </select></label>
    {dates.length ? <>
      <label className="field">Source date<select disabled={busy} value={source} onChange={event => setSelected(event.target.value)}>
        {dates.map(day => <option value={day} key={day}>{formatDate(day)}</option>)}
      </select></label>
      <p>{entries.length} {entries.length === 1 ? 'entry' : 'entries'} · {formatNutrient(summarize(entries).totals.calories, 'calories')} kcal</p>
    </> : <p>There are no earlier entries for this meal.</p>}
    {error && <p className="danger" role="alert">{error}</p>}
    <button className="primary self-start" disabled={!source || busy}>Copy meal</button>
  </form>
}

export function NutritionScreen({ today, onEditing }: { today: string; onEditing: (editing: boolean) => void }) {
  const [section, setSection] = useState<Section>('Daily Log')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const date = selectedDate ?? today
  const [panel, setPanel] = useState<Panel | null>(null)
  const [query, setQuery] = useState('')
  const [month, setMonth] = useState('')
  const [sort, setSort] = useState('recent')
  const [readError, setReadError] = useState(false)
  const [reload, setReload] = useState(0)
  const [actionError, setActionError] = useState('')
  const data = useLiveQuery(async () => {
    try {
      return await db.transaction('r', db.foods, db.foodLogs, async () => ({
        foods: await db.foods.toArray(),
        logs: await db.foodLogs.orderBy('date').reverse().toArray(),
      }))
    } catch {
      setReadError(true)
      return undefined
    }
  }, [reload])

  function show(next: Panel | null) {
    setPanel(next)
    onEditing(!!next)
    window.scrollTo(0, 0)
  }

  function openDate(day: string) {
    setSelectedDate(day === today ? null : day)
    setSection('Daily Log')
    window.scrollTo(0, 0)
  }

  if (readError) return <section className="card stack"><h1>Nutrition</h1>
    <p role="alert">Your nutrition records could not be opened.</p>
    <button className="secondary self-start" onClick={() => { setReadError(false); setReload(reload + 1) }}>Retry</button>
  </section>
  if (!data) return <p role="status">Opening nutrition diary…</p>

  const { foods, logs } = data
  const recency = logs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const seen = new Set<string>()
  const recent = recency.filter(entry => {
    const key = entry.foodId ?? entry.name.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const dates = new Map<string, FoodLogEntry[]>()
  for (const entry of logs) {
    const entries = dates.get(entry.date)
    if (entries) entries.push(entry)
    else dates.set(entry.date, [entry])
  }
  const history = [...dates].filter(([day]) => !month || day.startsWith(month))
  function changeMonth(delta: number) {
    const current = new Date((month || today.slice(0, 7)) + '-01T12:00:00')
    current.setMonth(current.getMonth() + delta)
    setMonth(localDate(current).slice(0, 7))
  }
  const entries = (dates.get(date) ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const lastUse = new Map<string, string>()
  const frequencies = new Map<string, number>()
  for (const log of recency) {
    if (!log.foodId) continue
    if (!lastUse.has(log.foodId)) lastUse.set(log.foodId, log.createdAt)
    frequencies.set(log.foodId, (frequencies.get(log.foodId) ?? 0) + 1)
  }
  const matchingFoods = foods.filter(food => [food.name, food.brand, food.category].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      const alphabetical = a.name.localeCompare(b.name)
      const recentlyUsed = (lastUse.get(b.id) ?? '').localeCompare(lastUse.get(a.id) ?? '')
      if (sort === 'name') return alphabetical
      if (sort === 'favorites') return Number(b.favorite) - Number(a.favorite) || alphabetical
      if (sort === 'frequent') return (frequencies.get(b.id) ?? 0) - (frequencies.get(a.id) ?? 0) || recentlyUsed || alphabetical
      return recentlyUsed || alphabetical
    })

  return <div className="stack nutrition">
    <h1>Nutrition</h1>
    {panel?.type === 'log' ? <LogEditor date={date} meal={panel.meal} foods={foods} recent={recent}
      entry={panel.entry} initialFood={panel.initialFood} onClose={day => {
        if (day) openDate(day)
        show(null)
      }} />
    : panel?.type === 'food' ? <FoodEditor food={panel.food} duplicate={panel.duplicate} onClose={() => show(null)} />
    : panel?.type === 'copy' ? <CopyMealEditor meal={panel.meal} date={date} logs={logs} onClose={() => show(null)} />
    : <>
      <nav aria-label="Nutrition sections" className="nutrition-segments">
        {sections.map(item => <button key={item} aria-pressed={section === item} onClick={() => setSection(item)}>{item}</button>)}
      </nav>
      {section === 'Daily Log' && <>
        <section className="card stack">
          <div className="row between wrap">
            <h2>{date === today ? 'Today' : formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
            <div className="row wrap">
              {date !== today && <button className="text-button" onClick={() => openDate(today)}>Today</button>}
              <button className="primary" onClick={() => show({ type: 'log', meal: 'Breakfast' })}><Plus size={17} /> Add food</button>
            </div>
          </div>
          <div className="nutrition-date">
            <button className="icon-button" aria-label="Previous day" onClick={() => openDate(shiftDay(date, -1))}><ChevronLeft size={20} /></button>
            <DatePicker date={date} label="Diary date" select={openDate} />
            <button className="icon-button" aria-label="Next day" onClick={() => openDate(shiftDay(date, 1))}><ChevronRight size={20} /></button>
          </div>
          <DayTotals entries={entries} />
        </section>
        {meals.map(meal => {
          const mealEntries = entries.filter(entry => entry.meal === meal)
          return <section className="card stack nutrition-meal" key={meal}>
            <div className="row between wrap"><div><h2>{meal}</h2>
              <p>{formatNutrient(summarize(mealEntries).totals.calories, 'calories')} kcal</p></div>
              <button className="secondary" aria-label={'Add food to ' + meal.toLowerCase()} onClick={() => show({ type: 'log', meal })}>
                <Plus size={16} /> Add food
              </button>
            </div>
            {mealEntries.map(entry => <button className="nutrition-entry" key={entry.id} onClick={() => show({ type: 'log', meal, entry })}>
              <span><strong>{entry.name}</strong><small>{entry.quantity !== null
                ? entry.quantity + ' ' + entry.unit : entry.description || 'Quick add'}</small></span>
              <span>{formatNutrient(entry.nutrition.calories, 'calories')} kcal</span><ChevronRight size={17} />
            </button>)}
            {!mealEntries.length && <p>No foods logged.</p>}
            <button className="text-button self-start" aria-label={'Copy previous meal into ' + meal.toLowerCase()}
              onClick={() => show({ type: 'copy', meal })}><Copy size={16} /> Copy previous meal</button>
          </section>
        })}
      </>}
      {section === 'History' && <>
        <div className="card row between wrap">
          <h2><CalendarDays size={19} className="nutrition-inline-icon" /> Open a date</h2>
          <DatePicker date={date} label="Open historical date" select={openDate} />
        </div>
        {dates.size > 0 && <div className="card stack">
          <div className="row between">
            <button className="icon-button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></button>
            <strong>{month ? formatDate(month + '-01', { month: 'long', year: 'numeric' }) : 'All logged days'}</strong>
            <button className="icon-button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={20} /></button>
          </div>
          {month && <button className="text-button self-center" onClick={() => setMonth('')}>Show all months</button>}
        </div>}
        {!history.length && <div className="card empty"><h2>{month ? 'No logs this month' : 'No logged days yet'}</h2><p>Your food diary history will appear here.</p></div>}
        {history.map(([day, items]) => <button className="card nutrition-history" key={day} onClick={() => openDate(day)}>
          <h2>{formatDate(day)}</h2><DayTotals entries={items} compact />
        </button>)}
      </>}
      {section === 'My Foods' && <>
        <div className="row between wrap"><h2>My Foods</h2>
          <button className="primary" onClick={() => show({ type: 'food' })}><Plus size={17} /> New food</button>
        </div>
        <div className="stack">
          <label className="search"><Search size={19} aria-hidden="true" />
            <input aria-label="Search My Foods" value={query} placeholder="Search name, brand, or category"
              onChange={event => setQuery(event.target.value)} /></label>
          <label className="field nutrition-sort">Sort by<select value={sort} onChange={event => setSort(event.target.value)}>
            <option value="recent">Recently used</option><option value="frequent">Most used</option>
            <option value="favorites">Favorites</option><option value="name">Alphabetical</option>
          </select></label>
        </div>
        {actionError && <p role="alert" className="danger">{actionError}</p>}
        {!matchingFoods.length && <div className="card empty">
          <h3>{foods.length ? 'No matching foods' : 'Your food library is empty'}</h3>
          <p>{foods.length ? 'Try a different search.' : 'Save foods you eat often to log them again quickly.'}</p>
        </div>}
        {matchingFoods.map(food => <article className="card stack" key={food.id}>
          <div className="row between"><div className="nutrition-food-title">
            <h3>{food.name}</h3>{(food.brand || food.category) && <p>{[food.brand, food.category].filter(Boolean).join(' · ')}</p>}
          </div><button className="icon-button" aria-label={'Favorite ' + food.name} aria-pressed={food.favorite} onClick={async () => {
            setActionError('')
            try { await db.foods.update(food.id, current => { current.favorite = !current.favorite }) }
            catch { setActionError('Could not update this favorite.') }
          }}><Star size={20} fill={food.favorite ? 'currentColor' : 'none'} /></button></div>
          <p>{formatNutrient(food.serving.nutrition.calories, 'calories')} kcal per {food.serving.quantity} {food.serving.unit}</p>
          <FoodSource source={food.source} verified={food.verified} />
          <div className="row wrap">
            <button className="secondary" onClick={() => show({ type: 'log', meal: 'Breakfast', initialFood: food })}>Log food</button>
            <button className="text-button" onClick={() => show({ type: 'food', food })}>Edit</button>
            <button className="text-button" onClick={() => show({ type: 'food', food, duplicate: true })}>Duplicate</button>
          </div>
        </article>)}
      </>}
    </>}
  </div>
}
