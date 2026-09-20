import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addFoodEntry, addQuickEntry, deleteEntry, entriesForDay, restoreEntry } from './entries'
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
