import type { FoodCategory, Per100 } from '@/domain/types'

const ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product'
const FIELDS = 'product_name,product_name_ru,brands,nutriments,categories_tags,serving_quantity'

/** Дольше восьми секунд человек не ждёт, а решает, что всё зависло */
export const LOOKUP_TIMEOUT_MS = 8000

/*
 * Пределы на 100 г. Базу правит кто угодно, и в ней встречаются килоджоули
 * в поле калорий, отрицательные числа и строки вместо чисел. Жир — самое
 * калорийное, что бывает в еде: 900 ккал на 100 г, больше не бывает.
 */
const MAX_KCAL = 900
const MAX_GRAMS = 100
/** Сумма БЖУ на 100 г: запас на округление в самой базе */
const MAX_MACROS_SUM = 101
const MAX_SERVING = 5000
const MAX_NAME = 120
const MAX_BRAND = 60

export interface OffProduct {
  name: string
  brand?: string
  per100: Per100
  category: FoodCategory
  servingGrams?: number
}

/**
 * Чем закончился поиск. Причины различаются, потому что и советы человеку
 * разные: «введите вручную», «попробуйте позже» или «проверьте сеть».
 */
export type OffLookup =
  | { kind: 'found'; product: OffProduct }
  /** Такого кода в базе нет */
  | { kind: 'missing' }
  /** Товар в базе есть, но без названия или с негодным составом */
  | { kind: 'incomplete' }
  /** База ответила 429 или 5xx: перегружена или ограничила частоту */
  | { kind: 'unavailable' }
  /** База не ответила за LOOKUP_TIMEOUT_MS */
  | { kind: 'timeout' }
  /** Запрос не ушёл: сети нет или её что-то режет */
  | { kind: 'offline' }
  /** Ответ пришёл, но разобрать его нельзя */
  | { kind: 'broken' }

/**
 * Единственный сетевой запрос во всём приложении.
 * Вызывается только когда штрихкода нет в локальной базе и сеть доступна.
 *
 * Отмена снаружи (человек ушёл со сканера) — не результат, а исключение:
 * показывать по ней нечего. Всё остальное, включая сбои сети, возвращается
 * значением, чтобы экран не путал «нет в базе» с «нет сети».
 */
export async function lookupProduct(
  barcode: string, signal?: AbortSignal, timeoutMs = LOOKUP_TIMEOUT_MS,
): Promise<OffLookup> {
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctrl.abort() }, timeoutMs)
  const cancel = () => ctrl.abort()
  if (signal?.aborted) ctrl.abort()
  signal?.addEventListener('abort', cancel)

  try {
    let res: Response
    let body: string
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(barcode)}?fields=${FIELDS}`, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      })
      // Тело читается под тем же тайм-аутом: зависнуть может и оно
      body = await res.text()
    } catch (e) {
      if (signal?.aborted) throw e
      return { kind: timedOut ? 'timeout' : 'offline' }
    }

    const byStatus = kindForStatus(res.status)
    if (byStatus) return { kind: byStatus }

    let json: unknown
    try {
      json = JSON.parse(body)
    } catch {
      return { kind: 'broken' }
    }
    return parseProduct(json)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

/** Ответ без содержимого: 404 — кода нет, прочие ошибки — база недоступна */
export function kindForStatus(status: number): 'missing' | 'unavailable' | null {
  if (status >= 200 && status < 300) return null
  return status === 404 ? 'missing' : 'unavailable'
}

/** Разбор ответа базы. Всё, что не проходит проверку, в дневник не попадает */
export function parseProduct(json: unknown): Exclude<OffLookup, { kind: 'unavailable' | 'timeout' | 'offline' }> {
  if (!isRecord(json)) return { kind: 'broken' }
  if (json.status === 0) return { kind: 'missing' }
  const p = json.product
  if (json.status !== 1 || !isRecord(p)) return { kind: 'broken' }

  const name = clip(text(p.product_name_ru) || text(p.product_name), MAX_NAME)
  const nut = isRecord(p.nutriments) ? p.nutriments : {}

  // Калории берутся из ккал, а если их нет или они негодные — из кДж
  const kcal = [amount(nut['energy-kcal_100g']), divide(amount(nut['energy_100g']), 4.184)]
    .find((v): v is number => typeof v === 'number' && v <= MAX_KCAL)

  // Отсутствующий нутриент — это ноль, как и раньше. А вот мусор в нём
  // означает, что состав целиком под подозрением
  const macros = [nut['proteins_100g'], nut['fat_100g'], nut['carbohydrates_100g']].map(amount)
  const [protein = 0, fat = 0, carbs = 0] = macros.map((v) => v ?? 0)
  const macrosOk = macros.every((v) => v !== null && (v ?? 0) <= MAX_GRAMS)
    && protein + fat + carbs <= MAX_MACROS_SUM

  if (!name || kcal === undefined || !macrosOk) return { kind: 'incomplete' }

  const brand = typeof p.brands === 'string' ? clip(text(p.brands.split(',')[0]), MAX_BRAND) : ''
  const serving = amount(p.serving_quantity)
  const tags = Array.isArray(p.categories_tags)
    ? p.categories_tags.filter((t): t is string => typeof t === 'string')
    : []

  return {
    kind: 'found',
    product: {
      name,
      ...(brand ? { brand } : {}),
      per100: {
        kcal: Math.round(kcal),
        protein: round1(protein),
        fat: round1(fat),
        carbs: round1(carbs),
      },
      category: categoryFromTags(tags),
      ...(serving && serving <= MAX_SERVING ? { servingGrams: round1(serving) } : {}),
    },
  }
}

/*
 * Сопоставление тегов Open Food Facts с нашими категориями.
 *
 * Теги идут от общего к частному, поэтому смотрим с конца: «гречка» точнее
 * «семян». Смысл тега — его последнее слово: milk-chocolates — это шоколад,
 * а fruit-juices — сок. Теги вида «A-and-B» — зонтики, по ним ничего
 * не понять: корень всех растительных продуктов называется
 * plant-based-foods-and-beverages, и из-за слова beverages хлеб и гречка
 * раньше становились напитками.
 */
const HEAD_WORDS: [FoodCategory, RegExp][] = [
  ['drink', /^(beverages|drinks|waters|juices|nectars|sodas|colas|teas|coffees|wines|beers)$/],
  ['dairy', /^(dairies|milks|yogurts|yoghurts|cheeses|kefirs|butters)$/],
  ['meat', /^(meats|poultries|chickens|turkeys|beef|sausages|hams)$/],
  ['fish', /^(fishes|fish|seafood|salmons|tunas|herrings|shrimps)$/],
  ['egg', /^eggs$/],
  ['bread', /^(breads|bakery|crispbreads)$/],
  ['grain', /^(cereals|grains|pastas|rices|rice|buckwheat|oats)$/],
  ['vegetable', /^(vegetables|legumes|beans|lentils|chickpeas|peas|potatoes)$/],
  ['fruit', /^(fruits|berries|apples|bananas)$/],
  ['nut', /^(nuts|seeds|almonds|peanuts)$/],
  ['sweet', /^(sweets|snacks|chocolates|biscuits|cookies|cakes|desserts|candies|confectioneries)$/],
  ['oil', /^(fats|oils)$/],
  ['sauce', /^(sauces|condiments|ketchup|mayonnaises)$/],
  ['dish', /^(meals|dishes|pizzas|soups|sandwiches)$/],
]

export function categoryFromTags(tags: string[]): FoodCategory {
  for (const tag of [...tags].reverse()) {
    const words = tag.replace(/^[a-z]{2}:/, '').split('-')
    if (words.includes('and')) continue
    const head = words[words.length - 1] ?? ''
    const hit = HEAD_WORDS.find(([, re]) => re.test(head))
    if (hit) return hit[0]
  }
  return 'other'
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
}

/** Обрезка по символам, а не по UTF-16: эмодзи не должны разваливаться */
function clip(s: string, max: number): string {
  const chars = [...s]
  return chars.length > max ? chars.slice(0, max).join('').trim() : s
}

/**
 * Количество из ответа. База отдаёт и числа, и строки, иногда с запятой.
 * undefined — поля нет, null — поле есть, но в нём мусор.
 */
function amount(v: unknown): number | null | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = typeof v === 'number' ? v
    : typeof v === 'string' ? Number(v.trim().replace(',', '.'))
    : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}

function divide(v: number | null | undefined, by: number): number | null | undefined {
  return typeof v === 'number' ? v / by : v
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
