import type { Food, FoodCategory } from '@/domain/types'
import { db, getMeta, setMeta, META } from './db'

/** Компактный формат вшитой базы: короткие ключи ради размера файла */
interface RawFood {
  id: string
  n: string
  c: FoodCategory
  k: number
  p: number
  f: number
  u: number
  s?: { n: string; g: number }[]
}

interface RawDoc {
  version: number
  items: RawFood[]
}

function toFood(raw: RawFood): Food {
  return {
    id: raw.id,
    name: raw.n,
    per100: { kcal: raw.k, protein: raw.p, fat: raw.f, carbs: raw.u },
    servings: [
      { name: '100 г', grams: 100 },
      ...(raw.s ?? []).map((s) => ({ name: s.n, grams: s.g })),
    ],
    category: raw.c,
    source: 'builtin',
    usageCount: 0,
    lastUsedAt: 0,
  }
}

/** Файл справочника или null, если он не загрузился или пришёл битым */
async function loadDoc(): Promise<RawDoc | null> {
  try {
    const res = await fetch('/data/foods.json')
    if (!res.ok) return null
    const doc = (await res.json()) as Partial<RawDoc> | null
    if (typeof doc?.version !== 'number' || !Array.isArray(doc.items)) return null
    return doc as RawDoc
  } catch {
    return null
  }
}

/**
 * Посев базы при первом запуске и при выходе новой версии справочника.
 *
 * Три вещи, которые здесь легко сломать:
 *
 * 1. Продукты, которые пользователь завёл или отредактировал сам, не трогаются —
 *    bulkPut перезаписал бы их.
 * 2. У уже существующих продуктов сохраняются usageCount и lastUsedAt.
 *    Без этого обновление справочника обнулило бы «недавнее» и «часто»,
 *    то есть незаметно сломало бы самый быстрый способ добавить еду.
 * 3. Продукты, исчезнувшие из справочника, удаляются. Иначе убранное
 *    из базы навсегда осталось бы у тех, кто уже поставил приложение.
 *    Записи дневника при этом не страдают: они хранят снимок ценности,
 *    а не ссылку на продукт.
 */
export async function seedFoods(): Promise<void> {
  const seeded = await getMeta<number>(META.seedVersion, 0)
  const doc = await loadDoc()
  if (!doc) {
    // Справочник уже лежит в базе — работаем со старым, а новую версию
    // заберём при следующем запуске. Раньше любая сетевая осечка закрывала
    // весь дневник экраном «Failed to fetch», хотя все данные были на месте.
    if (seeded > 0) return
    throw new Error(
      'Не удалось загрузить базу продуктов. Проверьте интернет и откройте приложение ещё раз.',
    )
  }
  if (seeded >= doc.version) return

  const userOwned = new Set(
    await db.foods.where('source').notEqual('builtin').primaryKeys(),
  )
  const incoming = doc.items.filter((r) => !userOwned.has(r.id))

  const previous = await db.foods.bulkGet(incoming.map((r) => r.id))
  const rows = incoming.map((raw, i) => {
    const before = previous[i]
    const food = toFood(raw)
    return before
      ? { ...food, usageCount: before.usageCount, lastUsedAt: before.lastUsedAt }
      : food
  })

  await db.foods.bulkPut(rows)

  const shipped = new Set(doc.items.map((r) => r.id))
  const stale = (await db.foods.where('source').equals('builtin').primaryKeys())
    .filter((id) => !shipped.has(id))
  if (stale.length > 0) await db.foods.bulkDelete(stale)

  await setMeta(META.seedVersion, doc.version)
}
