import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  CalendarDays, ChartNoAxesColumnIncreasing, ChevronRight, ClipboardList,
  Copy, DatabaseBackup, Dumbbell, Plus, Salad, Sparkles, Utensils,
} from 'lucide-react'
import { BackupScreen } from './components/BackupScreen'
import { NutritionScreen } from './components/nutrition/NutritionScreen'
import { ProgressScreen } from './components/progress/ProgressScreen'
import { WorkoutEditor } from './components/WorkoutEditor'
import { db } from './data/db'
import { workoutOrder } from './data/history'
import { duplicateWorkout, formatDate, kinds, localDate, newWorkout, type Workout } from './data/model'
import { recoverWorkout, useWorkout } from './data/useWorkout'

const tabs = [
  { name: 'Workouts', icon: Dumbbell, description: '' },
  { name: 'Recipes', icon: Utensils, description: 'A place to keep the meals you want to make again.' },
  { name: 'Nutrition', icon: Salad, description: '' },
  { name: 'Progress', icon: ChartNoAxesColumnIncreasing, description: '' },
] as const

export default function App() {
  const { needRefresh: [updateReady], updateServiceWorker } = useRegisterSW()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const interval = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  const [tab, setTab] = useState<(typeof tabs)[number]['name']>('Workouts')
  const [progressOpened, setProgressOpened] = useState(false)
  const [progressEditing, setProgressEditing] = useState(false)
  const [nutritionEditing, setNutritionEditing] = useState(false)
  const [nutritionOpened, setNutritionOpened] = useState(false)
  const [backup, setBackup] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startup, setStartup] = useState<'loading' | 'ready' | 'error'>('loading')
  const editor = useWorkout()
  const data = useLiveQuery(async () => {
    if (startup !== 'ready') return undefined
    try {
      return await db.transaction('r', db.workouts, db.exercises, db.settings, async () => ({
        workouts: (await db.workouts.toArray()).sort((a, b) => workoutOrder(b, a)),
        exercises: await db.exercises.toArray(),
        lastExport: (await db.settings.get('lastExport'))?.value,
      }))
    } catch {
      setStartup('error')
      return undefined
    }
  }, [startup])

  useEffect(() => {
    if (startup !== 'loading') return
    let active = true
    void db.open().then(recoverWorkout).then(() => {
      if (active) setStartup('ready')
    }).catch(() => { if (active) setStartup('error') })
    return () => { active = false }
  }, [startup])

  function open(workout: Workout, isNew = false) {
    editor.open(workout, isNew)
    setStarting(false)
    window.scrollTo(0, 0)
  }

  async function switchTab(next: typeof tab) {
    if (next === tab) return
    if (editor.draft && !await editor.close()) return
    setBackup(false)
    setStarting(false)
    if (next === 'Nutrition') setNutritionOpened(true)
    if (next === 'Progress') setProgressOpened(true)
    setTab(next)
    window.scrollTo(0, 0)
  }

  const today = localDate(now)
  const unfinished = data?.workouts.find(workout => !workout.completedAt)
  const recentExport = data?.lastExport && now.getTime() - Date.parse(data.lastExport) < 14 * 86400000
  const activeTab = tabs.find(item => item.name === tab)!
  const PlaceholderIcon = activeTab.icon

  return <>
    <header className="topbar">
      <div className="shell row between">
        <button className="brand" aria-label="FitLog, all workouts" onClick={async () => {
          if (editor.draft && !await editor.close()) return
          setBackup(false)
          setStarting(false)
          setTab('Workouts')
          window.scrollTo(0, 0)
        }}>FitLog</button>
        {data && tab === 'Workouts' && !editor.draft && !backup &&
          <button className="icon-button data-button" aria-label="Data and backup" title="Data & Backup"
            onClick={() => setBackup(true)}><DatabaseBackup size={21} /></button>}
      </div>
    </header>
    <main className="shell">
      {startup === 'error' ? <section className="card stack">
        <h1>Local storage unavailable</h1><p>FitLog couldn’t open IndexedDB or recover a pending edit.</p>
        <button className="primary self-start" onClick={() => setStartup('loading')}>Retry</button>
      </section> : !data ? <p role="status">Opening FitLog…</p> : tab === 'Nutrition' || tab === 'Progress' ? null : tab !== 'Workouts' ?
        <section className="placeholder card stack">
          <span className="feature-icon placeholder-icon" aria-hidden="true">
            <PlaceholderIcon size={30} /><Sparkles className="placeholder-sparkle" size={16} />
          </span>
          <h1>{tab}</h1><span className="badge">Coming Soon</span><p>{activeTab.description}</p>
        </section> : editor.draft ?
          <WorkoutEditor key={editor.draft.id} workout={editor.draft} workouts={data.workouts}
            exercises={data.exercises} update={editor.update} status={editor.status} flush={editor.flush} close={editor.close} />
          : backup ? <BackupScreen lastExport={data.lastExport} back={() => setBackup(false)} /> :
            <div className="home stack">
              <div className="page-title">
                <p className="date-label"><CalendarDays size={17} /> {formatDate(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                <h1>Workouts</h1>
              </div>
              <section className="hero">
                <div className="hero-art" aria-hidden="true">
                  <img src="/icon-192.png" width={104} height={104} alt="" />
                  <Sparkles className="hero-sparkle" size={23} strokeWidth={1.5} />
                </div>
                <h2>{unfinished ? 'Pick up where you left off' : 'Ready to train?'}</h2>
                <p>{unfinished ? (unfinished.name || unfinished.kind) + ' is in progress.' : 'Start a session and keep your last sets in reach.'}</p>
                <div className="row wrap">
                  {unfinished && <button className="hero-primary" onClick={() => open(unfinished)}>Resume workout</button>}
                  <button className={unfinished ? 'hero-secondary' : 'hero-primary'} aria-expanded={starting}
                    onClick={() => setStarting(!starting)}><Plus size={19} /> Start workout</button>
                </div>
              </section>
              {starting && <section className="card stack">
                <h2>Choose a workout</h2>
                <div className="split-grid">{kinds.map(kind => <button className="secondary" key={kind}
                  onClick={() => open(newWorkout(kind), true)}>{kind}</button>)}</div>
              </section>}
              <section className="stack history-section">
                <div className="row between"><h2>Workout history</h2><span className="count">{data.workouts.length}</span></div>
                {!data.workouts.length && <div className="card empty">
                  <span className="feature-icon empty-icon" aria-hidden="true"><ClipboardList size={25} /></span>
                  <h3>No workouts yet</h3><p>Your first logged workout will appear here.</p>
                </div>}
                {data.workouts.map(workout => <article className="card workout-row" key={workout.id}>
                  <button className="workout-link" onClick={() => open(workout)}>
                    <span className="feature-icon"><Dumbbell size={20} /></span>
                    <span><strong>{workout.name || workout.kind}</strong>
                      <small>{formatDate(workout.date, { month: 'short', day: 'numeric', year: 'numeric' })} · {workout.exercises.length} {workout.exercises.length === 1 ? 'exercise' : 'exercises'}</small>
                      {!workout.completedAt && <small className="accent">In progress</small>}</span>
                    <ChevronRight className="workout-chevron" size={18} />
                  </button>
                  <button className="icon-button" aria-label={'Duplicate ' + (workout.name || workout.kind)}
                    title="Duplicate workout" onClick={() => open(duplicateWorkout(workout), true)}><Copy size={18} /></button>
                </article>)}
              </section>
              {!recentExport && <button className="backup-reminder" onClick={() => setBackup(true)}>
                <DatabaseBackup size={18} /> {data.lastExport ? 'Generate a fresh backup' : 'Back up your workout data'} <ChevronRight size={16} />
              </button>}
              {updateReady && !unfinished && !nutritionEditing && !progressEditing && <div className="row between card">
                <span>FitLog update available</span>
                <button className="secondary" onClick={() => void updateServiceWorker(true)}>Reload to update</button>
              </div>}
            </div>}
      {data && nutritionOpened && <div hidden={tab !== 'Nutrition'}>
        <NutritionScreen today={today} onEditing={setNutritionEditing} />
      </div>}
      {data && progressOpened && <div hidden={tab !== 'Progress'}>
        <ProgressScreen today={today} lastExport={data.lastExport} onEditing={setProgressEditing} />
      </div>}
    </main>
    <nav className="bottom" aria-label="Main navigation">
      <div className="shell tabs">{tabs.map(item => <button key={item.name} aria-current={item.name === tab ? 'page' : undefined}
        onClick={() => void switchTab(item.name)}><item.icon size={21} /><span>{item.name}</span></button>)}</div>
    </nav>
  </>
}
