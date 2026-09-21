import type { Entry, Food, Meal, Recipe } from '@/domain/types'
import { dayKey } from '@/domain/dates'
import { db } from './db'
import { newId } from './ids'
import { markUsed } from './foods'

export async function entriesForDay(date: string): Promise<Entry[]> {
  return db.entries.where('date').equals(date).sortBy('createdAt')
}

export async function entriesForRange(from: string, to: string): Promise<Entry[]> {
  return db.entries.where('date').between(from, to, true, true).toArray()
}

export async function addFoodEntry(
  food: Food, grams: number, meal: Meal, date = dayKey(),
): Promise<Entry> {
  const entry: Entry = {
    id: newId('e'),
    date,
    meal,
    title: food.brand ? `${food.name}, ${food.brand}` : food.name,
    category: food.category,
    grams,
    // Снимок, а не ссылка: правка продукта не должна переписывать историю
    per100: { ...food.per100 },
    refId: food.id,
    refType: 'food',
    createdAt: Date.now(),
  }
  await db.entries.put(entry)
  await markUsed(food.id)
  return entry
}

export async function addRecipeEntry(
  recipe: Recipe, per100: Entry['per100'], grams: number, meal: Meal, date = dayKey(),
): Promise<Entry> {
  const entry: Entry = {
    id: newId('e'),
    date,
    meal,
    title: recipe.name,
    category: 'dish',
    grams,
    per100: { ...per100 },
    refId: recipe.id,
    refType: 'recipe',
    createdAt: Date.now(),
  }
  await db.entries.put(entry)
  // Рецепт считается использованным так же, как продукт: иначе он никогда
  // не всплывал бы наверх списка. Счётчик читается из базы, а не из
  // переданного объекта: тот мог устареть, и два добавления подряд
  // засчитывались бы как одно.
  await db.transaction('rw', db.recipes, async () => {
    const current = await db.recipes.get(recipe.id)
    if (!current) return
    await db.recipes.update(recipe.id, {
      usageCount: (current.usageCount ?? 0) + 1,
      lastUsedAt: Date.now(),
    })
  })
  return entry
}

/**
 * «+ 150 ккал» без продукта: перекус, о котором лень думать. В базу
 * продуктов ничего не заводится, в дневнике — обычная запись на 100 г.
 *
 * Состав необязателен. Если его не указали, запись помечается noMacros:
 * нули в белках значат «неизвестно», а не «ноль», и отчёт обязан их
 * различать. Если состав указали, запись ничем не отличается от обычной.
 */
export async function addQuickEntry(
  kcal: number, meal: Meal, date = dayKey(),
  macros?: { protein?: number; fat?: number; carbs?: number },
): Promise<Entry> {
  const protein = macros?.protein ?? 0
  const fat = macros?.fat ?? 0
  const carbs = macros?.carbs ?? 0
  const known = protein > 0 || fat > 0 || carbs > 0
  const entry: Entry = {
    id: newId('e'),
    date,
    meal,
    title: 'Быстрая запись',
    category: 'other',
    grams: 100,
    per100: { kcal, protein, fat, carbs },
    ...(known ? {} : { noMacros: true as const }),
    createdAt: Date.now(),
  }
  await db.entries.put(entry)
  return entry
}

/** Блюдо из каталога: своего продукта у него нет, поэтому пишем запись напрямую */
export async function addCatalogEntry(
  recipe: { id: string; title: string; per100: Entry['per100'] },
  grams: number, meal: Meal, date = dayKey(),
): Promise<Entry> {
  const entry: Entry = {
    id: newId('e'),
    date,
    meal,
    title: recipe.title,
    category: 'dish',
    grams,
    per100: { ...recipe.per100 },
    refId: recipe.id,
    refType: 'recipe',
    createdAt: Date.now(),
  }
  await db.entries.put(entry)
  return entry
}

export async function updateEntryGrams(id: string, grams: number): Promise<void> {
  await db.entries.update(id, { grams })
}

export async function deleteEntry(id: string): Promise<void> {
  await db.entries.delete(id)
}

/** «Отменить» после удаления: запись возвращается с тем же id и датой */
export async function restoreEntry(entry: Entry): Promise<void> {
  await db.entries.put(entry)
}

/** «Скопировать вчерашний день» и «повторить приём пищи» */
export async function copyDay(from: string, to: string, meal?: Meal): Promise<number> {
  const source = await entriesForDay(from)
  // Время у копий идёт по порядку оригиналов. С одним Date.now() на всех
  // день сортировался по случайным id, и завтрак каждый раз перемешивался.
  const now = Date.now()
  const rows = (meal ? source.filter((e) => e.meal === meal) : source).map((e, i) => ({
    ...e,
    id: newId('e'),
    date: to,
    createdAt: now + i,
  }))
  if (rows.length === 0) return 0
  await db.entries.bulkPut(rows)
  return rows.length
}
