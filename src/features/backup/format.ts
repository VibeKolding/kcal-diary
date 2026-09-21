import type {
  ActivityRecord, DayNote, Entry, Food, FoodCategory, Nutrients, Profile, Recipe, Theme,
  WaterRecord, WeightRecord, WorkoutSet,
} from '@/domain/types'
import type { FavoriteRecord } from '@/db/db'
import { MEALS } from '@/domain/nutrition'
import { ACTIVITY_FACTORS, GOAL_MACROS } from '@/domain/targets'

/*
 * Формат файла копии и его проверка.
 *
 * Импорт — единственное место, куда в приложение попадает файл извне, а
 * файл бывает чей угодно: поправленный руками, от другой сборки, битый.
 * Раньше проверялась только обёртка, и запись без состава или с приёмом
 * «brunch» ложилась в базу как есть — после этого главный экран белел при
 * каждом запуске, а до «Вернуть как было» в профиле было не добраться.
 *
 * Поэтому каждая запись каждого раздела проверяется до того, как тронута
 * база, и собирается заново только из известных полей: лишнее (в том числе
 * «__proto__» и «constructor») в базу не попадает. Первая же ошибка
 * отклоняет файл целиком с сообщением, где именно беда: половина
 * восстановленного дневника хуже, чем несостоявшееся восстановление.
 *
 * Пределы шире, чем пускают формы: проверка ловит битые файлы, а не
 * необычные дневники. Собственная копия приложения должна читаться всегда.
 */

export const FORMAT = 'kcal-diary-backup'
export const FORMAT_VERSION = 1

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

export class BackupError extends Error {}

const SECTIONS = {
  profile: 'Профиль',
  foods: 'Продукты',
  recipes: 'Рецепты',
  entries: 'Записи дневника',
  weights: 'Вес',
  water: 'Вода',
  activity: 'Активность',
  notes: 'Заметки к дням',
  sets: 'Подходы',
  favorites: 'Избранное',
} as const

type Section = keyof typeof SECTIONS

const MAX_ID = 200
const MAX_NAME = 500
const MAX_NOTE = 10_000
const MAX_LIST = 1000
/** На 100 г. У быстрой записи сюда пишется калорийность всего перекуса */
const MAX_KCAL = 100_000
const MAX_MACRO = 10_000
const MAX_GRAMS = 100_000
const MAX_COUNT = 1_000_000_000
/** Предел Date: дальше отметка времени перестаёт быть датой */
const MAX_TIME = 8.64e15

const SEXES = ['male', 'female'] as const
const THEMES: readonly Theme[] = ['dark', 'light']
const ACTIVITIES = Object.keys(ACTIVITY_FACTORS) as (keyof typeof ACTIVITY_FACTORS)[]
const GOALS = Object.keys(GOAL_MACROS) as (keyof typeof GOAL_MACROS)[]
const SOURCES = ['builtin', 'off', 'user'] as const
const REF_TYPES = ['food', 'recipe'] as const
// Record, а не массив: забытая категория — ошибка компиляции, а не
// отклонённая копия
const CATEGORY_SET: Record<FoodCategory, true> = {
  meat: true, fish: true, dairy: true, egg: true, grain: true, bread: true,
  vegetable: true, fruit: true, nut: true, sweet: true, drink: true,
  oil: true, sauce: true, dish: true, other: true,
}
const CATEGORIES = Object.keys(CATEGORY_SET) as FoodCategory[]

/** Беда в одном поле. Выше она обрастает разделом и номером записи. */
class FieldError extends Error {
  constructor(readonly field: string, readonly problem: string) {
    super(`${field}: ${problem}`)
  }
}

type Raw = Record<string, unknown>

function show(v: unknown): string {
  if (v === undefined) return 'пусто'
  const s = JSON.stringify(v) ?? String(v)
  return s.length > 30 ? `${s.slice(0, 30)}…` : s
}

function isRaw(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function absent(o: Raw, key: string): boolean {
  return o[key] === undefined || o[key] === null
}

/** Ошибки вложенного объекта получают путь: «per100.kcal», «items[2].grams» */
function within<T>(path: string, read: () => T): T {
  try {
    return read()
  } catch (e) {
    if (e instanceof FieldError) throw new FieldError(e.field ? `${path}.${e.field}` : path, e.problem)
    throw e
  }
}

function object(o: Raw, key: string): Raw {
  const v = o[key]
  if (!isRaw(v)) throw new FieldError(key, 'нет или это не объект')
  return v
}

function text(o: Raw, key: string, max: number): string {
  const v = o[key]
  if (typeof v !== 'string') throw new FieldError(key, `нужен текст, а здесь ${show(v)}`)
  if (v.length > max) throw new FieldError(key, `длиннее ${max} символов`)
  return v
}

function optText(o: Raw, key: string, max: number): string | undefined {
  return absent(o, key) ? undefined : text(o, key, max)
}

function id(o: Raw, key: string): string {
  const v = text(o, key, MAX_ID)
  if (v.length === 0) throw new FieldError(key, 'пустой идентификатор')
  return v
}

function num(o: Raw, key: string, min: number, max: number): number {
  const v = o[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new FieldError(key, `нужно число, а здесь ${show(v)}`)
  }
  if (v < min || v > max) throw new FieldError(key, `должно быть от ${min} до ${max}, а здесь ${v}`)
  return v
}

function optNum(o: Raw, key: string, min: number, max: number): number | undefined {
  return absent(o, key) ? undefined : num(o, key, min, max)
}

function int(o: Raw, key: string, min: number, max: number): number {
  const v = num(o, key, min, max)
  if (!Number.isInteger(v)) throw new FieldError(key, `должно быть целым, а здесь ${v}`)
  return v
}

function time(o: Raw, key: string): number {
  return num(o, key, 0, MAX_TIME)
}

function bool(o: Raw, key: string): boolean {
  const v = o[key]
  if (typeof v !== 'boolean') throw new FieldError(key, `нужно true или false, а здесь ${show(v)}`)
  return v
}

function oneOf<T extends string>(o: Raw, key: string, allowed: readonly T[]): T {
  const v = o[key]
  // includes, а не «in»: у обычного объекта «constructor» и «__proto__»
  // тоже «есть», и проверка через него пропустила бы их как значения
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new FieldError(key, `неизвестное значение ${show(v)}`)
  }
  return v as T
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Ключ дня «ГГГГ-ММ-ДД», и дата при этом настоящая: не 2026-02-30 */
export function isDayKey(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = DAY_RE.exec(v)
  if (!m) return false
  const y = Number(m[1])
  const month = Number(m[2])
  const d = Number(m[3])
  if (y < 1900 || y > 2200 || month < 1 || month > 12 || d < 1) return false
  return d <= new Date(y, month, 0).getDate()
}

function day(o: Raw, key: string): string {
  const v = o[key]
  if (!isDayKey(v)) throw new FieldError(key, `нужна дата вида ГГГГ-ММ-ДД, а здесь ${show(v)}`)
  return v
}

function list<T>(o: Raw, key: string, max: number, read: (item: Raw) => T): T[] {
  const v = o[key]
  if (!Array.isArray(v)) throw new FieldError(key, 'нет или это не список')
  if (v.length > max) throw new FieldError(key, `больше ${max} элементов`)
  return v.map((item, i) => within(`${key}[${i}]`, () => {
    if (!isRaw(item)) throw new FieldError('', 'не объект')
    return read(item)
  }))
}

function nutrients(o: Raw, key: string): Nutrients {
  const n = object(o, key)
  return within(key, () => ({
    kcal: num(n, 'kcal', 0, MAX_KCAL),
    protein: num(n, 'protein', 0, MAX_MACRO),
    fat: num(n, 'fat', 0, MAX_MACRO),
    carbs: num(n, 'carbs', 0, MAX_MACRO),
  }))
}

// --- Записи по разделам. Каждая собирается заново, лишние поля отпадают ---

function parseProfile(o: Raw): Profile {
  if (o.id !== 1) throw new FieldError('id', `должно быть 1, а здесь ${show(o.id)}`)
  const glassMl = optNum(o, 'glassMl', 1, 10_000)
  const targetWeightKg = optNum(o, 'targetWeightKg', 1, 1000)
  return {
    id: 1,
    sex: oneOf(o, 'sex', SEXES),
    birthDate: day(o, 'birthDate'),
    heightCm: num(o, 'heightCm', 50, 300),
    activity: oneOf(o, 'activity', ACTIVITIES),
    goal: oneOf(o, 'goal', GOALS),
    ratePerWeek: num(o, 'ratePerWeek', 0, 2),
    targets: nutrients(o, 'targets'),
    targetsManual: bool(o, 'targetsManual'),
    // Тема из копии всё равно заменяется темой этого устройства (см.
    // backup.ts), поэтому её отсутствие поломкой не считается
    theme: THEMES.includes(o.theme as Theme) ? (o.theme as Theme) : 'light',
    waterGoalMl: num(o, 'waterGoalMl', 0, 100_000),
    ...(glassMl !== undefined ? { glassMl } : {}),
    ...(targetWeightKg !== undefined ? { targetWeightKg } : {}),
    createdAt: time(o, 'createdAt'),
  }
}

function parseFood(o: Raw): Food {
  const brand = optText(o, 'brand', MAX_NAME)
  const barcode = optText(o, 'barcode', 100)
  return {
    id: id(o, 'id'),
    name: text(o, 'name', MAX_NAME),
    ...(brand !== undefined ? { brand } : {}),
    ...(barcode !== undefined ? { barcode } : {}),
    per100: nutrients(o, 'per100'),
    servings: list(o, 'servings', 100, (s) => ({
      name: text(s, 'name', MAX_NAME),
      grams: num(s, 'grams', 0, MAX_GRAMS),
    })),
    category: oneOf(o, 'category', CATEGORIES),
    source: oneOf(o, 'source', SOURCES),
    usageCount: int(o, 'usageCount', 0, MAX_COUNT),
    lastUsedAt: time(o, 'lastUsedAt'),
  }
}

function parseRecipe(o: Raw): Recipe {
  const usageCount = absent(o, 'usageCount') ? undefined : int(o, 'usageCount', 0, MAX_COUNT)
  const lastUsedAt = absent(o, 'lastUsedAt') ? undefined : time(o, 'lastUsedAt')
  return {
    id: id(o, 'id'),
    name: text(o, 'name', MAX_NAME),
    items: list(o, 'items', MAX_LIST, (i) => ({
      foodId: id(i, 'foodId'),
      grams: num(i, 'grams', 0, MAX_GRAMS),
    })),
    yieldGrams: num(o, 'yieldGrams', 0, MAX_GRAMS),
    portions: num(o, 'portions', 0, 10_000),
    createdAt: time(o, 'createdAt'),
    ...(usageCount !== undefined ? { usageCount } : {}),
    ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
  }
}

function parseEntry(o: Raw): Entry {
  const refId = optText(o, 'refId', MAX_ID)
  const refType = absent(o, 'refType') ? undefined : oneOf(o, 'refType', REF_TYPES)
  const noMacros = absent(o, 'noMacros') ? false : bool(o, 'noMacros')
  return {
    id: id(o, 'id'),
    date: day(o, 'date'),
    meal: oneOf(o, 'meal', MEALS),
    title: text(o, 'title', MAX_NAME),
    category: oneOf(o, 'category', CATEGORIES),
    grams: num(o, 'grams', 0, MAX_GRAMS),
    per100: nutrients(o, 'per100'),
    ...(refId !== undefined ? { refId } : {}),
    ...(refType !== undefined ? { refType } : {}),
    ...(noMacros ? { noMacros: true as const } : {}),
    createdAt: time(o, 'createdAt'),
  }
}

function parseWeight(o: Raw): WeightRecord {
  const waist = optNum(o, 'waist', 0, 1000)
  const chest = optNum(o, 'chest', 0, 1000)
  const hips = optNum(o, 'hips', 0, 1000)
  return {
    date: day(o, 'date'),
    kg: num(o, 'kg', 1, 1000),
    ...(waist !== undefined ? { waist } : {}),
    ...(chest !== undefined ? { chest } : {}),
    ...(hips !== undefined ? { hips } : {}),
  }
}

function parseWater(o: Raw): WaterRecord {
  return { date: day(o, 'date'), ml: num(o, 'ml', 0, 100_000) }
}

function parseActivity(o: Raw): ActivityRecord {
  return {
    id: id(o, 'id'),
    date: day(o, 'date'),
    name: text(o, 'name', MAX_NAME),
    minutes: num(o, 'minutes', 0, 10_000),
    kcal: num(o, 'kcal', 0, MAX_KCAL),
  }
}

function parseNote(o: Raw): DayNote {
  return { date: day(o, 'date'), text: text(o, 'text', MAX_NOTE) }
}

function parseSet(o: Raw): WorkoutSet {
  return {
    id: id(o, 'id'),
    date: day(o, 'date'),
    exerciseId: id(o, 'exerciseId'),
    weightKg: num(o, 'weightKg', 0, 10_000),
    reps: num(o, 'reps', 0, 10_000),
    createdAt: time(o, 'createdAt'),
  }
}

function parseFavorite(o: Raw): FavoriteRecord {
  const key = text(o, 'key', MAX_ID + 20)
  if (!/^(food|recipe|exercise):./.test(key)) throw new FieldError('key', `неизвестный вид ${show(key)}`)
  return { key, createdAt: time(o, 'createdAt') }
}

/**
 * Раздел целиком. Одинаковые ключи схлопываются, как их схлопнула бы
 * и сама база, — чтобы «Восстановлено: N» совпадало с тем, что в ней окажется.
 */
function section<T>(
  data: Raw, key: Section, required: boolean,
  read: (o: Raw) => T, keyOf: (item: T) => string | number,
): T[] {
  const raw = data[key]
  if (raw === undefined && !required) return []
  if (!Array.isArray(raw)) {
    throw new BackupError(`В копии повреждён раздел «${SECTIONS[key]}» (${key}). Дневник не тронут.`)
  }
  const byKey = new Map<string | number, T>()
  raw.forEach((item, i) => {
    try {
      if (!isRaw(item)) throw new FieldError('', 'это не объект')
      const clean = read(item)
      byKey.set(keyOf(clean), clean)
    } catch (e) {
      if (!(e instanceof FieldError)) throw e
      const where = e.field ? `поле «${e.field}» — ` : ''
      throw new BackupError(
        `В копии повреждена запись № ${i + 1} в разделе «${SECTIONS[key]}»: ${where}${e.problem}. ` +
        'Дневник не тронут.',
      )
    }
  })
  return [...byKey.values()]
}

/**
 * Проверенная копия из того, что вернул JSON.parse. Бросает BackupError
 * с объяснением по-русски; до базы в этот момент ещё ничего не дошло.
 */
export function parseBackup(data: unknown): Backup {
  if (!isRaw(data)) throw new BackupError('Файл не похож на резервную копию.')
  if (data.format !== FORMAT) {
    throw new BackupError('Это резервная копия не от этого приложения.')
  }
  const version = data.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BackupError('В копии повреждён номер версии формата.')
  }
  if (version > FORMAT_VERSION) {
    throw new BackupError('Копия сделана более новой версией приложения. Обновите его и попробуйте ещё раз.')
  }

  // Сначала — что все разделы на месте, потом — записи: так на совсем
  // чужой файл ответ про раздел, а не про запись № 1
  for (const key of ['profile', 'foods', 'recipes', 'entries', 'weights', 'water'] as const) {
    if (!Array.isArray(data[key])) {
      throw new BackupError(`В копии повреждён раздел «${SECTIONS[key]}» (${key}). Дневник не тронут.`)
    }
  }

  const profile = section(data, 'profile', true, parseProfile, (p) => p.id)
  // Без профиля приложение показало бы анкету поверх восстановленных
  // записей. Свои копии приложение без профиля не делает.
  if (profile.length === 0) {
    throw new BackupError('В копии нет профиля — похоже, файл собран не приложением. Дневник не тронут.')
  }

  return {
    format: FORMAT,
    version,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt.slice(0, 64) : '',
    profile,
    foods: section(data, 'foods', true, parseFood, (f) => f.id),
    recipes: section(data, 'recipes', true, parseRecipe, (r) => r.id),
    entries: section(data, 'entries', true, parseEntry, (e) => e.id),
    weights: section(data, 'weights', true, parseWeight, (w) => w.date),
    water: section(data, 'water', true, parseWater, (w) => w.date),
    // Тренировки убраны из интерфейса: в новых копиях раздел пуст, а в будущих
    // может исчезнуть вовсе — поэтому его отсутствие не считается поломкой
    activity: section(data, 'activity', false, parseActivity, (a) => a.id),
    notes: section(data, 'notes', false, parseNote, (n) => n.date),
    sets: section(data, 'sets', false, parseSet, (s) => s.id),
    favorites: section(data, 'favorites', false, parseFavorite, (f) => f.key),
  }
}

/**
 * Дневник, который нечего спасать: анкета и стартовый вес, больше ничего.
 *
 * Ровно такое состояние бывает на новом телефоне — после анкеты или вовсе
 * без неё. Точку возврата для него не заводим: восстановление здесь —
 * переезд, а не ошибка, и «Вернуть как было» вернуло бы пустую анкету
 * поверх только что перенесённого дневника.
 */
export function isEmptyDiary(b: Backup): boolean {
  return b.entries.length === 0
    && b.foods.length === 0
    && b.recipes.length === 0
    && b.weights.length <= 1
    && b.water.every((w) => w.ml === 0)
    && (b.activity ?? []).length === 0
    && (b.notes ?? []).length === 0
    && (b.sets ?? []).length === 0
    && (b.favorites ?? []).length === 0
}
