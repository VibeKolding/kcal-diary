import Fuse from 'fuse.js'
import type { Food, FoodCategory, Per100 } from '@/domain/types'
import { db } from './db'
import { newId } from './ids'
import { CATEGORY_LABELS } from '@/ui/FoodIcon'

let index: Fuse<Food> | null = null
let indexedAt = 0

/**
 * Текст для поиска: без регистра и без «ё». Почти все печатают «мед» и
 * «свекла», а в базе «Мёд» и «Свёкла» — и раньше мёд не находился вовсе.
 * Одна функция и для индекса, и для запроса, иначе они разойдутся.
 */
export function searchText(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е')
}

/**
 * Нечёткий поиск по названию: терпит опечатки и неполные слова.
 * Индекс строится один раз и переживает добавление продуктов до перезагрузки
 * страницы — invalidateIndex() сбрасывает его после записи в базу.
 */
async function getIndex(): Promise<Fuse<Food>> {
  if (index && Date.now() - indexedAt < 5 * 60_000) return index
  const all = await db.foods.toArray()
  index = new Fuse(all, {
    // Категория тоже ищется: «рыба» находит тунца, даже если слова «рыба»
    // в названии нет. Вес маленький, чтобы не перебивать совпадение по имени.
    keys: [
      { name: 'name', weight: 3 },
      { name: 'brand', weight: 1 },
      { name: 'categoryLabel', weight: 0.5 },
    ],
    getFn: (obj, path) => {
      const key = Array.isArray(path) ? path[0] : path
      const value = key === 'categoryLabel'
        ? CATEGORY_LABELS[(obj as Food).category]
        : Fuse.config.getFn(obj, path)
      if (typeof value === 'string') return searchText(value)
      return Array.isArray(value) ? value.map(searchText) : value
    },
    includeScore: true,
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 2,
  })
  indexedAt = Date.now()
  return index
}

export function invalidateIndex(): void {
  index = null
}

export async function searchFoods(query: string, limit = 40): Promise<Food[]> {
  const q = searchText(query).trim()
  if (q.length < 2) return recentFoods(limit)
  const fuse = await getIndex()
  const words = [...new Set(q.split(/\s+/).filter((w) => w.length >= 2))]
  if (words.length <= 1) return fuse.search(words[0] ?? q, { limit }).map((r) => r.item)
  return rankByWords(words.map((w) => fuse.search(w)), (f) => f.id, limit)
}

/**
 * Многословный запрос: каждое слово ищется отдельно, в любом порядке.
 *
 * Целиком строка искалась одним шаблоном, и «вареная гречка» не находила
 * «Гречку варёную», а «гречневая каша» не находила ничего. Теперь оценки
 * по словам складываются (у Fuse меньше — лучше), а за каждое ненайденное
 * слово добавляется единица — хуже любого совпадения. Поэтому сначала идут
 * продукты, где нашлись все слова, за ними — где нашлась часть: лучше
 * показать близкое, чем пустой список.
 */
export function rankByWords<T>(
  perWord: { item: T; score?: number }[][],
  keyOf: (item: T) => string,
  limit: number,
): T[] {
  const hits = new Map<string, { item: T; words: number; score: number }>()
  for (const results of perWord) {
    for (const r of results) {
      const key = keyOf(r.item)
      const hit = hits.get(key) ?? { item: r.item, words: 0, score: 0 }
      hit.words += 1
      hit.score += r.score ?? 1
      hits.set(key, hit)
    }
  }
  const rank = (h: { words: number; score: number }) => h.score + (perWord.length - h.words)
  return [...hits.values()]
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit)
    .map((h) => h.item)
}

/** Недавнее и частое — сюда попадает большинство добавлений */
export async function recentFoods(limit = 20): Promise<Food[]> {
  const recent = await db.foods
    .where('lastUsedAt').above(0)
    .reverse().sortBy('lastUsedAt')
  return recent.slice(0, limit)
}

export async function frequentFoods(limit = 12): Promise<Food[]> {
  const used = await db.foods.where('usageCount').above(0).toArray()
  return used.sort((a, b) => b.usageCount - a.usageCount).slice(0, limit)
}

export async function findByBarcode(barcode: string): Promise<Food | undefined> {
  return db.foods.where('barcode').equals(barcode).first()
}

/** Чтение и запись счётчика — одной транзакцией, как у воды: два быстрых
    добавления одного продукта иначе засчитывались как одно */
export async function markUsed(foodId: string): Promise<void> {
  await db.transaction('rw', db.foods, async () => {
    const food = await db.foods.get(foodId)
    if (!food) return
    await db.foods.update(foodId, {
      usageCount: (food.usageCount || 0) + 1,
      lastUsedAt: Date.now(),
    })
  })
}

export interface NewFoodInput {
  name: string
  brand?: string
  barcode?: string
  per100: Per100
  category: FoodCategory
  servings?: { name: string; grams: number }[]
  source?: Food['source']
}

export async function createFood(input: NewFoodInput): Promise<Food> {
  // Последний рубеж: формы и разбор ответа Open Food Facts уже проверяют
  // числа, но NaN или минус в базе продуктов тихо портили бы каждую запись
  // с этим продуктом, а резервная копия с ним перестала бы читаться
  const { kcal, protein, fat, carbs } = input.per100
  const bad = [kcal, protein, fat, carbs].some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0)
  if (bad) throw new Error('Некорректная пищевая ценность')
  const food: Food = {
    id: newId('f'),
    name: input.name.trim(),
    ...(input.brand ? { brand: input.brand.trim() } : {}),
    ...(input.barcode ? { barcode: input.barcode } : {}),
    per100: input.per100,
    servings: [{ name: '100 г', grams: 100 }, ...(input.servings ?? [])],
    category: input.category,
    source: input.source ?? 'user',
    usageCount: 0,
    lastUsedAt: Date.now(),
  }
  await db.foods.put(food)
  invalidateIndex()
  return food
}
