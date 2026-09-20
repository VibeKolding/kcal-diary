import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createFood } from './foods'
import { computeRecipe, saveRecipe, listRecipes, deleteRecipe } from './recipes'

async function reset() {
  await Promise.all([db.foods.clear(), db.recipes.clear()])
}

describe('пересчёт рецепта', () => {
  beforeEach(reset)

  it('делит сумму ингредиентов на вес готового блюда, а не на их сумму', async () => {
    // 1000 г курицы по 200 ккал/100 г = 2000 ккал.
    // После жарки осталось 700 г — те же 2000 ккал стали плотнее.
    const chicken = await createFood({
      name: 'Курица', category: 'meat',
      per100: { kcal: 200, protein: 20, fat: 13, carbs: 0 },
    })
    const n = await computeRecipe({
      name: 'Жареная курица',
      items: [{ foodId: chicken.id, grams: 1000 }],
      yieldGrams: 700,
      portions: 2,
    })

    expect(n.total.kcal).toBe(2000)
    expect(n.per100.kcal).toBeCloseTo(2000 / 7, 4)
    expect(n.portionGrams).toBe(350)
  })

  it('без указания веса готового считает по сумме ингредиентов', async () => {
    const a = await createFood({
      name: 'Овсянка', category: 'grain',
      per100: { kcal: 350, protein: 12, fat: 7, carbs: 60 },
    })
    const b = await createFood({
      name: 'Молоко', category: 'dairy',
      per100: { kcal: 50, protein: 3, fat: 2.5, carbs: 5 },
    })
    const n = await computeRecipe({
      name: 'Каша',
      items: [{ foodId: a.id, grams: 100 }, { foodId: b.id, grams: 300 }],
      yieldGrams: 0,
      portions: 2,
    })

    // (350 + 150) ккал на 400 г = 125 ккал на 100 г
    expect(n.per100.kcal).toBeCloseTo(125, 6)
    expect(n.portionGrams).toBe(200)
  })

  it('складывает БЖУ всех ингредиентов', async () => {
    const a = await createFood({
      name: 'А', category: 'other',
      per100: { kcal: 100, protein: 10, fat: 5, carbs: 2 },
    })
    const b = await createFood({
      name: 'Б', category: 'other',
      per100: { kcal: 200, protein: 0, fat: 20, carbs: 4 },
    })
    const n = await computeRecipe({
      name: 'Смесь',
      items: [{ foodId: a.id, grams: 200 }, { foodId: b.id, grams: 100 }],
      yieldGrams: 300, portions: 1,
    })
    expect(n.total.protein).toBeCloseTo(20, 6)
    expect(n.total.fat).toBeCloseTo(30, 6)
    expect(n.total.carbs).toBeCloseTo(8, 6)
  })

  it('сообщает об удалённом ингредиенте, а не падает', async () => {
    const n = await computeRecipe({
      name: 'Битый рецепт',
      items: [{ foodId: 'нет-такого', grams: 100 }],
      yieldGrams: 100, portions: 1,
    })
    expect(n.missing).toBe(1)
    expect(n.per100.kcal).toBe(0)
  })

  it('не делит на ноль на пустом рецепте', async () => {
    const n = await computeRecipe({ name: 'Пусто', items: [], yieldGrams: 0, portions: 1 })
    expect(Number.isFinite(n.per100.kcal)).toBe(true)
    expect(n.per100.kcal).toBe(0)
  })

  it('не даёт задать меньше одной порции', async () => {
    const food = await createFood({
      name: 'Суп', category: 'dish',
      per100: { kcal: 50, protein: 2, fat: 1, carbs: 6 },
    })
    const r = await saveRecipe({
      name: 'Суп', items: [{ foodId: food.id, grams: 1000 }],
      yieldGrams: 1000, portions: 0,
    })
    expect(r.portions).toBe(1)
  })

  it('сохраняет и удаляет рецепт', async () => {
    const food = await createFood({
      name: 'Рис', category: 'grain',
      per100: { kcal: 130, protein: 2.4, fat: 0.2, carbs: 28.7 },
    })
    const r = await saveRecipe({
      name: 'Гарнир', items: [{ foodId: food.id, grams: 500 }],
      yieldGrams: 500, portions: 3,
    })
    expect((await listRecipes()).map((x) => x.name)).toEqual(['Гарнир'])
    await deleteRecipe(r.id)
    expect(await listRecipes()).toEqual([])
  })
})
