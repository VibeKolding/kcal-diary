import Dexie, { type Table } from 'dexie'
import type {
  ActivityRecord, DayNote, Entry, Food, Profile, Recipe, WaterRecord, WeightRecord, WorkoutSet,
} from '@/domain/types'

export interface FavoriteRecord {
  /** `food:<id>`, `recipe:<id>`, `exercise:<id>` */
  key: string
  createdAt: number
}

export interface MetaRecord {
  key: string
  value: unknown
}

/**
 * Всё хранится в IndexedDB на устройстве. Сервера нет.
 */
export class KcalDB extends Dexie {
  profile!: Table<Profile, number>
  foods!: Table<Food, string>
  recipes!: Table<Recipe, string>
  entries!: Table<Entry, string>
  weights!: Table<WeightRecord, string>
  water!: Table<WaterRecord, string>
  activity!: Table<ActivityRecord, string>
  meta!: Table<MetaRecord, string>
  notes!: Table<DayNote, string>
  sets!: Table<WorkoutSet, string>
  favorites!: Table<FavoriteRecord, string>

  constructor() {
    super('kcal-diary')
    this.version(1).stores({
      profile: 'id',
      foods: 'id, name, barcode, category, source, lastUsedAt, usageCount',
      recipes: 'id, name, createdAt',
      entries: 'id, date, [date+meal], createdAt, refId',
      weights: 'date',
      water: 'date',
      activity: 'id, date',
      meta: 'key',
    })
    // Версия 2: заметки к дню, журнал подходов и избранное. Старые таблицы
    // не меняются — Dexie переносит их как есть.
    this.version(2).stores({
      notes: 'date',
      sets: 'id, date, exerciseId, [exerciseId+date]',
      favorites: 'key, createdAt',
    })
  }
}

export const db = new KcalDB()

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export const META = {
  seedVersion: 'seedVersion',
  lastBackupAt: 'lastBackupAt',
  onboarded: 'onboarded',
  reminders: 'reminders',
  /** Согласился ли браузер держать хранилище постоянным */
  storagePersisted: 'storagePersisted',
  /** Снимок данных перед восстановлением из файла — чтобы был откат */
  restorePoint: 'restorePoint',
} as const
