import type { Food, Per100, Recipe } from '@/domain/types'
import { db } from './db'
import { newId } from './ids'

export interface RecipeDraft {
  name: string
  items: { foodId: string; grams: number }[]
  /** Вес готового блюда: меньше суммы ингредиентов из-за ужарки и уварки */
  yieldGrams: number
  portions: number
}

/** Сначала те, что добавляли недавно, потом новые по дате создания */
export async function listRecipes(): Promise<Recipe[]> {
  const rows = await db.recipes.toArray()
  return rows.sort((a, b) =>
    (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || b.createdAt - a.createdAt)
}

export async function saveRecipe(draft: RecipeDraft): Promise<Recipe> {
  const recipe: Recipe = {
    id: newId('r'),
    name: draft.name.trim(),
    items: draft.items,
    yieldGrams: draft.yieldGrams,
    portions: Math.max(1, draft.portions),
    createdAt: Date.now(),
  }
  await db.recipes.put(recipe)
  return recipe
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id)
}

export interface RecipeNutrition {
  /** Пищевая ценность 100 г ГОТОВОГО блюда */
  per100: Per100
  /** Суммарная ценность всех ингредиентов */
  total: Per100
  portionGrams: number
  missing: number
}

/**
 * Пересчёт рецепта на 100 г готового блюда.
 *
 * Ключевой момент — ужарка: килограмм сырого мяса даёт ~700 г готового,
 * и калории при этом никуда не деваются, а концентрируются.
 * Поэтому сумма ингредиентов делится на вес готового блюда, а не на их сумму.
 */
export async function computeRecipe(recipe: Recipe | RecipeDraft): Promise<RecipeNutrition> {
  const ids = recipe.items.map((i) => i.foodId)
  const foods = await db.foods.bulkGet(ids)
  const byId = new Map<string, Food>()
  foods.forEach((f) => { if (f) byId.set(f.id, f) })

  let total: Per100 = { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  let missing = 0

  for (const item of recipe.items) {
    const food = byId.get(item.foodId)
    if (!food) { missing += 1; continue }
    const k = item.grams / 100
    total = {
      kcal: total.kcal + food.per100.kcal * k,
      protein: total.protein + food.per100.protein * k,
      fat: total.fat + food.per100.fat * k,
      carbs: total.carbs + food.per100.carbs * k,
    }
  }

  const yieldGrams = recipe.yieldGrams > 0
    ? recipe.yieldGrams
    : recipe.items.reduce((sum, i) => sum + i.grams, 0)

  const scale = yieldGrams > 0 ? 100 / yieldGrams : 0

  return {
    per100: {
      kcal: total.kcal * scale,
      protein: total.protein * scale,
      fat: total.fat * scale,
      carbs: total.carbs * scale,
    },
    total,
    portionGrams: yieldGrams / Math.max(1, recipe.portions),
    missing,
  }
}
