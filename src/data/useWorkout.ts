import { useEffect, useRef, useState } from 'react'
import { db } from './db'
import { copySets, type Workout } from './model'

const recoveryPrefix = 'fitlog-pending-workout:'

interface Journal {
  workout: Workout
  base: Workout | null
  inFlight: Workout | null
}

const same = (a: Workout | null, b: Workout | null) => JSON.stringify(a) === JSON.stringify(b)

export async function recoverWorkout() {
  let keys: string[]
  try {
    keys = Object.keys(localStorage).filter(key => key.startsWith(recoveryPrefix))
  } catch {
    return
  }
  for (const key of keys) {
    const recover = async () => {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const journal: Journal = JSON.parse(raw)
      await db.transaction('rw', db.workouts, db.exercises, async () => {
        const current = await db.workouts.get(journal.workout.id) ?? null
        const ids = [...new Set(journal.workout.exercises.map(item => item.exerciseId))]
        const exercises = await db.exercises.bulkGet(ids)
        if (exercises.some(exercise => !exercise)) {
          throw new Error('A pending edit references exercises that are missing.')
        }
        if (same(current, journal.workout)) return
        if (same(current, journal.base) || (journal.inFlight && same(current, journal.inFlight))) {
          await db.workouts.put(journal.workout)
          return
        }
        const recovered = {
          ...journal.workout, id: key.slice(recoveryPrefix.length),
          name: (journal.workout.name || journal.workout.kind) + ' (recovered)',
          exercises: journal.workout.exercises.map(item => ({
            ...item, id: crypto.randomUUID(), sets: copySets(item.sets),
          })),
        }
        if (!await db.workouts.get(recovered.id)) await db.workouts.add(recovered)
      })
      if (localStorage.getItem(key) === raw) localStorage.removeItem(key)
    }
    if (navigator.locks) {
      await navigator.locks.request(key, { ifAvailable: true }, lock => lock ? recover() : undefined)
    } else {
      await recover()
    }
  }
}

export function useWorkout() {
  const [draft, setDraft] = useState<Workout | null>(null)
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const current = useRef<Workout | null>(null)
  const base = useRef<Workout | null>(null)
  const inFlight = useRef<Workout | null>(null)
  const recoveryKey = useRef('')
  const releaseLock = useRef<(() => void) | null>(null)
  const pending = useRef<Promise<boolean> | null>(null)
  const journalAvailable = useRef(true)
  const dirty = useRef(false)

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirty.current && !journalAvailable.current) {
        event.preventDefault()
        event.returnValue = true
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  function journal(workout: Workout) {
    if (!recoveryKey.current) {
      const key = recoveryPrefix + crypto.randomUUID()
      recoveryKey.current = key
      if (navigator.locks) {
        void navigator.locks.request(key, () => new Promise<void>(release => {
          if (recoveryKey.current === key) releaseLock.current = release
          else release()
        })).catch(() => {})
      }
    }
    try {
      localStorage.setItem(recoveryKey.current, JSON.stringify({ workout, base: base.current, inFlight: inFlight.current }))
      journalAvailable.current = true
    } catch {
      journalAvailable.current = false
    }
  }

  function flush(): Promise<boolean> {
    if (pending.current) return pending.current
    if (!dirty.current) return Promise.resolve(true)
    setStatus('saving')
    pending.current = (async () => {
      try {
        while (dirty.current && current.current) {
          const snapshot = current.current
          inFlight.current = snapshot
          journal(snapshot)
          await db.transaction('rw', db.workouts, db.exercises, async () => {
            const saved = await db.workouts.get(snapshot.id) ?? null
            if (same(saved, snapshot)) return
            if (!same(saved, base.current)) {
              throw new Error('This workout changed in another tab.')
            }
            const ids = [...new Set(snapshot.exercises.map(item => item.exerciseId))]
            if ((await db.exercises.bulkGet(ids)).some(exercise => !exercise)) {
              throw new Error('The exercise library changed in another tab.')
            }
            await db.workouts.put(snapshot)
          })
          inFlight.current = null
          base.current = snapshot
          dirty.current = current.current !== snapshot
          if (dirty.current && current.current) journal(current.current)
          else {
            try { localStorage.removeItem(recoveryKey.current) } catch { /* IndexedDB already committed. */ }
            recoveryKey.current = ''
            releaseLock.current?.()
            releaseLock.current = null
          }
        }
        setStatus('saved')
        return true
      } catch {
        setStatus('error')
        return false
      } finally {
        pending.current = null
      }
    })()
    return pending.current
  }

  function open(workout: Workout, isNew = false) {
    current.current = workout
    base.current = isNew ? null : workout
    setDraft(workout)
    setStatus('saved')
    if (isNew) update(() => workout)
  }

  function update(change: (workout: Workout) => Workout) {
    if (!current.current) return
    const next = change(current.current)
    current.current = next
    setDraft(next)
    dirty.current = true
    journal(next)
    void flush()
  }

  async function close() {
    if (!await flush()) return false
    current.current = null
    base.current = null
    setDraft(null)
    return true
  }

  return { draft, status, open, update, flush, close }
}
