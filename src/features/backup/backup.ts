import { db, getMeta, setMeta, META } from '@/db/db'
import { invalidateIndex } from '@/db/foods'
import { dayKey } from '@/domain/dates'
import type { Theme } from '@/domain/types'
import {
  BackupError, FORMAT, FORMAT_VERSION, isEmptyDiary, parseBackup, type Backup,
} from './format'
import { saveFile, type SaveOutcome } from './share'

export { BackupError, parseBackup, isEmptyDiary } from './format'
export type { Backup } from './format'

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

/** Имя по местной дате: ночью по UTC у Москвы ещё вчерашнее число */
export function backupFileName(now = new Date()): string {
  return `дневник-калорий-${dayKey(now)}.json`
}

export type ExportOutcome = SaveOutcome

/**
 * Скачать или отправить копию (см. share.ts). Отметка о копии ставится,
 * только если файл ушёл: закрытый лист «Поделиться» копией не считается,
 * и напоминание о ней должно остаться.
 */
export async function exportBackup(): Promise<ExportOutcome> {
  const backup = await buildBackup()
  const file = new File([JSON.stringify(backup)], backupFileName(), { type: 'application/json' })
  const outcome = await saveFile(file, 'Копия дневника калорий')
  if (outcome !== 'cancelled') await setMeta(META.lastBackupAt, Date.now())
  return outcome
}

export interface ImportResult {
  entries: number
  /** Свои продукты. Вшитые из копии дают только счётчики «недавнего» */
  foods: number
  weights: number
  /**
   * Что с «Вернуть как было»: 'saved' — точка возврата есть; 'empty' —
   * дневник был пуст, возвращать нечего; 'too-big' — снимок не поместился,
   * и об этом стоит сказать человеку: отменить восстановление нельзя.
   */
  undo: UndoState
}

export type UndoState = 'saved' | 'empty' | 'too-big'

/**
 * Разумный потолок для копии. Дневник за десять лет с тысячей своих продуктов
 * укладывается в единицы мегабайт, поэтому файл на полсотни — это либо ошибка,
 * либо попытка занять всё место на устройстве.
 */
const MAX_BACKUP_BYTES = 50 * 1024 * 1024

/** Все таблицы, которые трогает восстановление, — одной транзакцией с meta */
function restoreTables() {
  return [db.profile, db.foods, db.recipes, db.entries, db.weights, db.water, db.activity,
    db.notes, db.sets, db.favorites, db.meta]
}

/**
 * Импорт заменяет дневник целиком.
 *
 * Слияние двух историй пришлось бы разрешать вручную для каждой записи,
 * поэтому копия просто восстанавливается как есть — так поведение предсказуемо.
 *
 * Порядок важен. Сначала файл проверяется целиком (format.ts) — до этого
 * база не тронута. Потом одной транзакцией: точка возврата, заливка,
 * отметки. Если заливка упадёт, вместе с ней откатится и новая точка
 * возврата, и старая останется на месте. Раньше точка писалась отдельно
 * до заливки, и неудачный импорт затирал её — прежний дневник пропадал.
 *
 * Работает и на новом телефоне без анкеты: после импорта профиль из копии
 * на месте, и приложение открывает дневник, а не анкету.
 */
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
  const data = parseBackup(parsed)
  const theme = deviceTheme()

  const result = await db.transaction('rw', restoreTables(), async () => {
    const undo = await saveRestorePoint()
    const counts = await applyBackup(data, theme)
    await setMeta(META.onboarded, true)
    // Весь дневник сейчас совпадает с файлом, который у человека на руках,
    // — напоминать о копии сразу после переезда незачем
    await setMeta(META.lastBackupAt, Date.now())
    return { ...counts, undo }
  })

  invalidateIndex()
  return result
}

/**
 * Тема — настройка устройства, а не дневника: она живёт в localStorage и
 * атрибуте <html>, в профиле лишь её отражение. Старая копия не должна
 * переключать тему, иначе профиль и экран разошлись бы. undefined — узнать
 * не у кого (тесты), тогда остаётся тема текущего профиля или копии.
 */
function deviceTheme(): Theme | undefined {
  if (typeof document === 'undefined') return undefined
  const t = document.documentElement.dataset.theme
  return t === 'dark' || t === 'light' ? t : undefined
}

/**
 * Заливка копии поверх текущих данных. Вызывается внутри транзакции.
 *
 * Вшитые продукты из копии не заливаются: справочник мог с тех пор
 * обновиться — поправили калорийность, убрали продукт, — и старая копия
 * вернула бы и старые цифры, и удалённое (свинину в том числе), а посев
 * этого уже не исправил бы. Из копии берутся только их счётчики
 * «недавнего» и только для продуктов, которые в справочнике есть. У
 * остальных счётчики обнуляются: дневник заменён целиком, и «недавнее»
 * должно быть его, а не прежнего.
 */
async function applyBackup(data: Backup, theme: Theme | undefined): Promise<Omit<ImportResult, 'undo'>> {
  const keepTheme = theme ?? (await db.profile.get(1))?.theme
  const builtinIds = new Set(await db.foods.where('source').equals('builtin').primaryKeys())
  const usage = new Map(
    data.foods.filter((f) => f.source === 'builtin').map((f) => [f.id, f]),
  )
  // Свой продукт с идентификатором вшитого бывает только в собранном
  // вручную файле. Он подменил бы продукт справочника насовсем.
  const own = data.foods.filter((f) => f.source !== 'builtin' && !builtinIds.has(f.id))

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
  await db.foods.where('source').equals('builtin').modify((f) => {
    const used = usage.get(f.id)
    f.usageCount = used?.usageCount ?? 0
    f.lastUsedAt = used?.lastUsedAt ?? 0
  })
  await Promise.all([
    db.profile.bulkPut(data.profile.map((p) => (keepTheme ? { ...p, theme: keepTheme } : p))),
    db.foods.bulkPut(own),
    db.recipes.bulkPut(data.recipes),
    db.entries.bulkPut(data.entries),
    db.weights.bulkPut(data.weights),
    db.water.bulkPut(data.water),
    db.activity.bulkPut(data.activity ?? []),
    db.notes.bulkPut(data.notes ?? []),
    db.sets.bulkPut(data.sets ?? []),
    db.favorites.bulkPut(data.favorites ?? []),
  ])
  return { entries: data.entries.length, foods: own.length, weights: data.weights.length }
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
  /** Отметка о копии до восстановления: отмена возвращает и её */
  lastBackupAt?: number | null
}

/**
 * Вызывается внутри транзакции импорта. Прежняя точка не переживает новый
 * импорт ни при каком исходе: «как было» теперь значит «до этого файла», и
 * старая точка откатила бы не туда — через два восстановления назад.
 * Поэтому, если новый снимок не заводится, старый стирается.
 */
async function saveRestorePoint(): Promise<UndoState> {
  const before = await buildBackup()
  // Отменять нечего, если дневник пуст: первое восстановление на чистом
  // телефоне — обычный сценарий, а не ошибка.
  if (isEmptyDiary(before)) {
    await setMeta(META.restorePoint, null)
    return 'empty'
  }
  // Меряем байты, а не символы: кириллица в UTF-8 вдвое тяжелее
  if (new TextEncoder().encode(JSON.stringify(before)).length > MAX_RESTORE_POINT_BYTES) {
    await setMeta(META.restorePoint, null)
    return 'too-big'
  }
  const lastBackupAt = await getMeta<number | null>(META.lastBackupAt, null)
  await setMeta(META.restorePoint, { at: Date.now(), data: before, lastBackupAt } satisfies RestorePoint)
  return 'saved'
}

const WEEK = 7 * 24 * 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

/** Через неделю предложение «вернуть как было» вводит в заблуждение:
    человек давно живёт с восстановленными данными. */
function expired(rp: RestorePoint, now = Date.now()): boolean {
  return now - rp.at > WEEK
}

/** Когда сделана точка возврата. null — отменять нечего */
export async function restorePointAt(): Promise<number | null> {
  const rp = await getMeta<RestorePoint | null>(META.restorePoint, null)
  if (!rp) return null
  if (expired(rp)) {
    await setMeta(META.restorePoint, null)
    return null
  }
  return rp.at
}

/**
 * Вернуть данные, какими они были до восстановления из файла: дневник,
 * свои продукты, счётчики «недавнего» и отметку о копии. Тема остаётся
 * темой устройства — по той же причине, что и при импорте.
 */
export async function undoRestore(): Promise<ImportResult> {
  const theme = deviceTheme()
  const result = await db.transaction('rw', restoreTables(), async () => {
    const rp = await getMeta<RestorePoint | null>(META.restorePoint, null)
    if (!rp || expired(rp)) throw new BackupError('Возвращать нечего: точки возврата нет.')
    const counts = await applyBackup(rp.data, theme)
    if (rp.lastBackupAt !== undefined) await setMeta(META.lastBackupAt, rp.lastBackupAt)
    await setMeta(META.restorePoint, null)
    // Точка возврата израсходована: отменять отмену нечем
    return { ...counts, undo: 'empty' as const }
  })
  invalidateIndex()
  return result
}

export async function lastBackupAt(): Promise<number | null> {
  return getMeta<number | null>(META.lastBackupAt, null)
}

/** Первая копия напоминается не сразу: в первые дни в дневнике почти нечего терять */
export const FIRST_BACKUP_AFTER_DAYS = 3
export const BACKUP_STALE_DAYS = 7

/**
 * Пора ли напомнить о копии.
 *
 * Если записей нет — нечего и копировать. Если копии не было ни разу —
 * напоминаем, когда первой записи исполнилось три дня. Иначе — когда
 * последней копии больше недели.
 */
export function isBackupStale(s: {
  /** createdAt самой ранней записи; null — записей нет */
  firstEntryAt: number | null
  lastBackupAt: number | null
  now: number
}): boolean {
  if (s.firstEntryAt === null) return false
  if (s.lastBackupAt === null) return s.now - s.firstEntryAt >= FIRST_BACKUP_AFTER_DAYS * DAY
  return s.now - s.lastBackupAt > BACKUP_STALE_DAYS * DAY
}

/** Данные живут только в браузере — напоминаем о копии, если её давно не делали */
export async function backupIsStale(): Promise<boolean> {
  const first = await db.entries.orderBy('createdAt').first()
  return isBackupStale({
    firstEntryAt: first ? first.createdAt : null,
    lastBackupAt: await lastBackupAt(),
    now: Date.now(),
  })
}
