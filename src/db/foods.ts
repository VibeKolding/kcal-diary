import Fuse from 'fuse.js'
import type { Food, FoodCategory, Per100 } from '@/domain/types'
import { db } from './db'
import { newId } from './ids'
import { CATEGORY_LABELS } from '@/ui/FoodIcon'

let index: Fuse<Food> | null = null
let indexedAt = 0

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
      if (key === 'categoryLabel') return CATEGORY_LABELS[(obj as Food).category]
      return Fuse.config.getFn(obj, path)
    },
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
  const q = query.trim()
  if (q.length < 2) return recentFoods(limit)
  const fuse = await getIndex()
  return fuse.search(q, { limit }).map((r) => r.item)
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

export async function markUsed(foodId: string): Promise<void> {
  const food = await db.foods.get(foodId)
  if (!food) return
  await db.foods.update(foodId, {
    usageCount: food.usageCount + 1,
    lastUsedAt: Date.now(),
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
