import Dexie, { type Table } from 'dexie'
import { type Exercise, type Workout, starterExercises } from './model'

export interface Setting {
  key: 'lastExport'
  value: string
}

export const workoutStore = 'id,date,createdAt,completedAt'

export class FitLogDatabase extends Dexie {
  workouts!: Table<Workout, string>
  exercises!: Table<Exercise, string>
  settings!: Table<Setting, string>

  constructor(name = 'fitlog') {
    super(name)
    this.version(1).stores({ workouts: workoutStore, exercises: 'id,name' })
    this.version(2).stores({ workouts: workoutStore, exercises: 'id,name', settings: 'key' })
    this.on('populate', transaction => transaction.table('exercises').bulkAdd(starterExercises).then(() => {}))
  }
}

export const db = new FitLogDatabase()
