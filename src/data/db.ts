import Dexie, { type Table } from 'dexie'
import { type Exercise, type Workout, starterExercises } from './model'

import type { Food, FoodLogEntry } from './nutrition'
import type { WeightEntry, WeightSettings } from './weight/model'

export interface Setting {
  key: 'lastExport'
  value: string
}

export const workoutStore = 'id,date,createdAt,completedAt'

export class FitLogDatabase extends Dexie {
  workouts!: Table<Workout, string>
  exercises!: Table<Exercise, string>
  settings!: Table<Setting, string>

  foods!: Table<Food, string>
  foodLogs!: Table<FoodLogEntry, string>

  weightEntries!: Table<WeightEntry, string>
  weightSettings!: Table<WeightSettings, string>

  constructor(name = 'fitlog') {
    super(name)
    this.version(1).stores({ workouts: workoutStore, exercises: 'id,name' })
    this.version(2).stores({ workouts: workoutStore, exercises: 'id,name', settings: 'key' })
    this.version(3).stores({ foods: 'id,name', foodLogs: 'id,date,[date+meal],foodId' })
    this.version(4).stores({ weightEntries: 'id,&date', weightSettings: 'id' })
    this.on('populate', transaction => transaction.table('exercises').bulkAdd(starterExercises).then(() => {}))
  }
}

export const db = new FitLogDatabase()
