import type { FoodCategory, Per100 } from '@/domain/types'

const ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product'
const FIELDS = 'product_name,product_name_ru,brands,nutriments,categories_tags,serving_quantity'

export interface OffProduct {
  name: string
  brand?: string
  per100: Per100
  category: FoodCategory
  servingGrams?: number
}

/** Грубое сопоставление тегов Open Food Facts с нашими категориями */
function categoryFromTags(tags: string[]): FoodCategory {
  const t = tags.join(' ')
  if (/beverages|drinks|waters|juices/.test(t)) return 'drink'
  if (/dairies|milk|yogurt|cheese/.test(t)) return 'dairy'
  if (/meats|poultry|sausage|ham/.test(t)) return 'meat'
  if (/seafood|fish/.test(t)) return 'fish'
  if (/eggs/.test(t)) return 'egg'
  if (/breads|bakery/.test(t)) return 'bread'
  if (/cereals|pasta|rice|grains/.test(t)) return 'grain'
  if (/vegetables|legumes/.test(t)) return 'vegetable'
  if (/fruits|berries/.test(t)) return 'fruit'
  if (/nuts|seeds/.test(t)) return 'nut'
  if (/sweet|snacks|chocolate|biscuits|desserts/.test(t)) return 'sweet'
  if (/fats|oils/.test(t)) return 'oil'
  if (/sauces|condiments/.test(t)) return 'sauce'
  if (/meals|dishes|pizza/.test(t)) return 'dish'
  return 'other'
}

/**
 * Единственный сетевой запрос во всём приложении.
 * Вызывается только когда штрихкода нет в локальной базе и сеть доступна.
 */
export async function fetchProduct(barcode: string, signal?: AbortSignal): Promise<OffProduct | null> {
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(barcode)}?fields=${FIELDS}`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return null

  const json = (await res.json()) as {
    status?: number
    product?: {
      product_name?: string
      product_name_ru?: string
      brands?: string
      serving_quantity?: number | string
      categories_tags?: string[]
      nutriments?: Record<string, number | undefined>
    }
  }
  const p = json.product
  if (json.status !== 1 || !p) return null

  const nut = p.nutriments ?? {}
  const kcal = nut['energy-kcal_100g']
    ?? (nut['energy_100g'] !== undefined ? nut['energy_100g'] / 4.184 : undefined)

  const name = (p.product_name_ru || p.product_name || '').trim()
  if (!name || kcal === undefined) return null

  const serving = Number(p.serving_quantity)

  return {
    name,
    ...(p.brands ? { brand: p.brands.split(',')[0]!.trim() } : {}),
    per100: {
      kcal: Math.round(kcal),
      protein: round1(nut['proteins_100g'] ?? 0),
      fat: round1(nut['fat_100g'] ?? 0),
      carbs: round1(nut['carbohydrates_100g'] ?? 0),
    },
    category: categoryFromTags(p.categories_tags ?? []),
    ...(Number.isFinite(serving) && serving > 0 ? { servingGrams: serving } : {}),
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
