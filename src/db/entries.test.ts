import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addFoodEntry, addQuickEntry, copyDay, deleteEntry, entriesForDay, restoreEntry } from './entries'
import { createFood } from './foods'

describe('записи дневника', () => {
  beforeEach(async () => {
    await Promise.all([db.foods.clear(), db.entries.clear()])
  })

  it('удалённая запись возвращается тем же id после «Отменить»', async () => {
    const food = await createFood({
      name: 'Творог', category: 'dairy',
      per100: { kcal: 120, protein: 18, fat: 5, carbs: 3 },
    })
    const entry = await addFoodEntry(food, 200, 'breakfast', '2026-09-19')

    await deleteEntry(entry.id)
    expect(await entriesForDay('2026-09-19')).toHaveLength(0)

    await restoreEntry(entry)
    const back = await entriesForDay('2026-09-19')
    expect(back).toHaveLength(1)
    expect(back[0]?.id).toBe(entry.id)
    expect(back[0]?.grams).toBe(200)
  })
})

describe('«Как вчера» и счётчики', () => {
  beforeEach(async () => {
    await Promise.all([db.foods.clear(), db.entries.clear()])
  })

  /* Все копии получали один createdAt, и день сортировался по случайным id */
  it('копия дня сохраняет порядок записей', async () => {
    const food = await createFood({
      name: 'Хлеб', category: 'bread',
      per100: { kcal: 250, protein: 8, fat: 3, carbs: 49 },
    })
    for (const grams of [10, 20, 30, 40, 50, 60]) {
      await addFoodEntry(food, grams, 'breakfast', '2026-09-19')
    }
    await copyDay('2026-09-19', '2026-09-20')
    const copied = await entriesForDay('2026-09-20')
    expect(copied.map((e) => e.grams)).toEqual([10, 20, 30, 40, 50, 60])
  })

  it('два добавления подряд засчитываются оба', async () => {
    const food = await createFood({
      name: 'Кофе', category: 'drink',
      per100: { kcal: 2, protein: 0, fat: 0, carbs: 0 },
    })
    await Promise.all([
      addFoodEntry(food, 200, 'breakfast', '2026-09-20'),
      addFoodEntry(food, 200, 'breakfast', '2026-09-20'),
    ])
    expect((await db.foods.get(food.id))?.usageCount).toBe(2)
  })
})

describe('быстрая запись', () => {
  it('без состава помечается как запись с неизвестным БЖУ', async () => {
    const e = await addQuickEntry(150, 'snack', '2026-09-19')
    expect(e.noMacros).toBe(true)
    expect(e.per100.protein).toBe(0)
  })

  it('с составом флага не получает', async () => {
    const e = await addQuickEntry(150, 'snack', '2026-09-19', { protein: 12, fat: 3, carbs: 8 })
    expect(e.noMacros).toBeUndefined()
    expect(e.per100.protein).toBe(12)
  })
})
