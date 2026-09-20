import { db, getMeta, setMeta, META } from '@/db/db'
import { invalidateIndex } from '@/db/foods'
import type {
  ActivityRecord, DayNote, Entry, Food, Profile, Recipe, WaterRecord, WeightRecord, WorkoutSet,
} from '@/domain/types'
import type { FavoriteRecord } from '@/db/db'

const FORMAT = 'kcal-diary-backup'
const FORMAT_VERSION = 1

export interface Backup {
  format: typeof FORMAT
  version: number
  exportedAt: string
  profile: Profile[]
  foods: Food[]
  recipes: Recipe[]
  entries: Entry[]
  weights: WeightRecord[]
  water: WaterRecord[]
  activity?: ActivityRecord[]
  /* Появились во второй версии схемы; в старых копиях их нет, и это нормально */
  notes?: DayNote[]
  sets?: WorkoutSet[]
  favorites?: FavoriteRecord[]
}

export async function buildBackup(): Promise<Backup> {
  const [profile, foods, recipes, entries, weights, water, activity, notes, sets, favorites] = await Promise.all([
    db.profile.toArray(),
    // Вшитые продукты не выгружаем: они и так придут с приложением,
    // а файл бэкапа от них раздувается втрое
    db.foods.filter((f) => f.source !== 'builtin' || f.usageCount > 0).toArray(),
    db.recipes.toArray(),
    db.entries.toArray(),
    db.weights.toArray(),
    db.water.toArray(),
    db.activity.toArray(),
    db.notes.toArray(),
    db.sets.toArray(),
    db.favorites.toArray(),
  ])

  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    profile, foods, recipes, entries, weights, water, activity, notes, sets, favorites,
  }
}

export async function exportBackup(): Promise<void> {
  const backup = await buildBackup()
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `дневник-калорий-${backup.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  await setMeta(META.lastBackupAt, Date.now())
}

export class BackupError extends Error {}

function assertShape(data: unknown): asserts data is Backup {
  if (typeof data !== 'object' || data === null) {
    throw new BackupError('Файл не похож на резервную копию.')
  }
  const b = data as Partial<Backup>
  if (b.format !== FORMAT) {
    throw new BackupError('Это резервная копия не от этого приложения.')
  }
  if (typeof b.version !== 'number' || b.version > FORMAT_VERSION) {
    throw new BackupError('Копия сделана более новой версией приложения.')
  }
  for (const key of ['profile', 'foods', 'recipes', 'entries', 'weights', 'water'] as const) {
    if (!Array.isArray(b[key])) {
      throw new BackupError(`В копии повреждён раздел «${key}».`)
    }
  }
  // Тренировки убраны из интерфейса: в новых копиях раздел пуст, а в будущих
  // может исчезнуть вовсе — поэтому его отсутствие не считается поломкой
  for (const key of ['activity', 'notes', 'sets', 'favorites'] as const) {
    if (b[key] !== undefined && !Array.isArray(b[key])) {
      throw new BackupError(`В копии повреждён раздел «${key}».`)
    }
  }
}

export interface ImportResult {
  entries: number
  foods: number
  weights: number
}

/**
 * Импорт заменяет дневник целиком.
 *
 * Слияние двух историй пришлось бы разрешать вручную для каждой записи,
 * поэтому копия просто восстанавливается как есть — так поведение предсказуемо.
 * Вшитая база продуктов не трогается: она придёт из посева.
 */
/**
 * Разумный потолок для копии. Дневник за десять лет с тысячей своих продуктов
 * укладывается в единицы мегабайт, поэтому файл на полсотни — это либо ошибка,
 * либо попытка занять всё место на устройстве.
 */
const MAX_BACKUP_BYTES = 50 * 1024 * 1024

export async function importBackup(file: File): Promise<ImportResult> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new BackupError(
      `Файл слишком большой (${Math.round(file.size / 1024 / 1024)} МБ). ` +
      'Похоже, это не резервная копия дневника.',
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new BackupError('Файл не читается как JSON.')
  }
  assertShape(parsed)
  const data = parsed

  await saveRestorePoint()
  await applyBackup(data)

  invalidateIndex()
  return {
    entries: data.entries.length,
    foods: data.foods.length,
    weights: data.weights.length,
  }
}

/** Заливка копии поверх текущих данных. Одной транзакцией: половина
    восстановленного дневника хуже, чем несостоявшееся восстановление. */
async function applyBackup(data: Backup): Promise<void> {
  await db.transaction('rw',
    [db.profile, db.foods, db.recipes, db.entries, db.weights, db.water, db.activity,
      db.notes, db.sets, db.favorites],
    async () => {
      await Promise.all([
        db.profile.clear(),
        db.recipes.clear(),
        db.entries.clear(),
        db.weights.clear(),
        db.water.clear(),
        db.activity.clear(),
        db.notes.clear(),
        db.sets.clear(),
        db.favorites.clear(),
        db.foods.where('source').notEqual('builtin').delete(),
      ])
      await Promise.all([
        db.profile.bulkPut(data.profile),
        db.foods.bulkPut(data.foods),
        db.recipes.bulkPut(data.recipes),
        db.entries.bulkPut(data.entries),
        db.weights.bulkPut(data.weights),
        db.water.bulkPut(data.water),
        db.activity.bulkPut(data.activity ?? []),
        db.notes.bulkPut(data.notes ?? []),
        db.sets.bulkPut(data.sets ?? []),
        db.favorites.bulkPut(data.favorites ?? []),
      ])
    })
}

/*
 * Точка возврата перед восстановлением.
 *
 * Восстановление стирает всё и заливает файл. Файл может оказаться не тем:
 * прошлогодней копией, копией с другого телефона, просто старой. Отменить
 * это было нельзя — сегодняшний день исчезал молча и навсегда. Поэтому
 * перед заливкой откладывается снимок текущего состояния.
 *
 * Снимок — тот же формат, что и файл копии, то есть вшитые продукты в него
 * не попадают и он невелик. Всё равно ставим потолок: смысл точки возврата
 * в том, чтобы спасти данные, а не в том, чтобы удвоить занятое место.
 */
const MAX_RESTORE_POINT_BYTES = 5 * 1024 * 1024

interface RestorePoint {
  at: number
  data: Backup
}

async function saveRestorePoint(): Promise<void> {
  const before = await buildBackup()
  // Отменять нечего, если дневник пуст: первое восстановление на чистом
  // телефоне — обычный сценарий, а не ошибка.
  if (before.entries.length === 0 && before.profile.length === 0) return
  if (JSON.stringify(before).length > MAX_RESTORE_POINT_BYTES) return
  await setMeta(META.restorePoint, { at: Date.now(), data: before } satisfies RestorePoint)
}

/** Когда сделана точка возврата. null — отменять нечего */
export async function restorePointAt(): Promise<number | null> {
  const rp = await getMeta<RestorePoint | null>(META.restorePoint, null)
  if (!rp) return null
  // Через неделю предложение «вернуть как было» вводит в заблуждение:
  // человек давно живёт с восстановленными данными.
  if (Date.now() - rp.at > WEEK) {
    await setMeta(META.restorePoint, null)
    return null
  }
  return rp.at
}

/** Вернуть данные, какими они были до восстановления из файла */
export async function undoRestore(): Promise<ImportResult> {
  const rp = await getMeta<RestorePoint | null>(META.restorePoint, null)
  if (!rp) throw new BackupError('Возвращать нечего: точки возврата нет.')
  await applyBackup(rp.data)
  await setMeta(META.restorePoint, null)
  invalidateIndex()
  return {
    entries: rp.data.entries.length,
    foods: rp.data.foods.length,
    weights: rp.data.weights.length,
  }
}

const WEEK = 7 * 24 * 60 * 60 * 1000

export async function lastBackupAt(): Promise<number | null> {
  return getMeta<number | null>(META.lastBackupAt, null)
}

/** Данные живут только в браузере — напоминаем о копии, если её давно не делали */
export async function backupIsStale(): Promise<boolean> {
  const last = await lastBackupAt()
  const hasData = (await db.entries.count()) > 0
  if (!hasData) return false
  return last === null || Date.now() - last > WEEK
}
