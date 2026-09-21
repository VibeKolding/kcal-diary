import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { db, getMeta, META } from './db'
import { seedFoods } from './seed'
import { createFood } from './foods'

const raw = readFileSync('public/data/foods.json', 'utf8')
// Версию берём из файла: захардкоженное число ломало бы тест
// при каждом обновлении справочника
const CURRENT_VERSION = (JSON.parse(raw) as { version: number }).version

function mockFetch(body: string) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => JSON.parse(body) as unknown,
  })))
}

async function reset() {
  await Promise.all([db.foods.clear(), db.meta.clear()])
  vi.unstubAllGlobals()
}

describe('посев базы продуктов', () => {
  beforeEach(reset)

  it('заполняет базу при первом запуске', async () => {
    mockFetch(raw)
    await seedFoods()
    expect(await db.foods.count()).toBeGreaterThan(100)
    expect(await getMeta(META.seedVersion, 0)).toBe(CURRENT_VERSION)
  })

  it('повторный вызов той же версии ничего не делает', async () => {
    mockFetch(raw)
    await seedFoods()
    const before = await db.foods.count()
    await seedFoods()
    expect(await db.foods.count()).toBe(before)
  })

  /**
   * Самое хрупкое место: обновление справочника не должно стирать
   * «недавнее» и «часто» — это основной способ быстро добавить еду.
   */
  it('сохраняет счётчики использования при обновлении версии', async () => {
    mockFetch(raw)
    await seedFoods()

    const first = (await db.foods.where('source').equals('builtin').first())!
    await db.foods.update(first.id, { usageCount: 7, lastUsedAt: 1_700_000_000 })

    const doc = JSON.parse(raw) as { version: number; items: unknown[] }
    mockFetch(JSON.stringify({ ...doc, version: doc.version + 1 }))
    await seedFoods()

    const after = await db.foods.get(first.id)
    expect(after?.usageCount).toBe(7)
    expect(after?.lastUsedAt).toBe(1_700_000_000)
  })

  /**
   * Убранное из справочника должно исчезать и у тех, кто уже поставил
   * приложение. Иначе, например, свинина осталась бы в поиске навсегда.
   */
  it('удаляет продукты, исчезнувшие из справочника', async () => {
    mockFetch(raw)
    await seedFoods()

    const doomed = (await db.foods.where('source').equals('builtin').first())!
    const doc = JSON.parse(raw) as { version: number; items: { id: string }[] }
    const trimmed = {
      ...doc,
      version: doc.version + 1,
      items: doc.items.filter((i) => i.id !== doomed.id),
    }
    mockFetch(JSON.stringify(trimmed))
    await seedFoods()

    expect(await db.foods.get(doomed.id)).toBeUndefined()
    expect(await db.foods.count()).toBe(trimmed.items.length)
  })

  it('не затирает продукты, заведённые пользователем', async () => {
    mockFetch(raw)
    await seedFoods()

    const mine = await createFood({
      name: 'Бабушкин пирог', category: 'sweet',
      per100: { kcal: 400, protein: 5, fat: 20, carbs: 50 },
    })

    const doc = JSON.parse(raw) as { version: number; items: unknown[] }
    mockFetch(JSON.stringify({ ...doc, version: doc.version + 1 }))
    await seedFoods()

    const after = await db.foods.get(mine.id)
    expect(after?.name).toBe('Бабушкин пирог')
    expect(after?.source).toBe('user')
  })

  it('в справочнике нет свинины', async () => {
    mockFetch(raw)
    await seedFoods()
    const pork = /свинин|бекон|шпик|сало\b|сосиск|колбас|шашлык|карбонад|грудинк|окорок/i
    const found = (await db.foods.toArray())
      .filter((f) => pork.test(f.name))
      .map((f) => f.name)
    expect(found, `найдено: ${found.join(', ')}`).toEqual([])
  })

  it('любая ветчина в справочнике — куриная', async () => {
    mockFetch(raw)
    await seedFoods()
    const hams = (await db.foods.toArray())
      .filter((f) => /ветчин/i.test(f.name))
      .map((f) => f.name)
    expect(hams).toEqual(['Ветчина куриная'])
  })

  /*
   * Сетевая осечка при уже засеянной базе закрывала весь дневник экраном
   * «Failed to fetch», хотя все данные были на месте.
   */
  it('без сети работает со старым справочником и пробует снова в следующий раз', async () => {
    mockFetch(raw)
    await seedFoods()
    const count = await db.foods.count()

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(seedFoods()).resolves.toBeUndefined()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => null })))
    await expect(seedFoods()).resolves.toBeUndefined()
    expect(await db.foods.count()).toBe(count)
  })

  it('на самом первом запуске без справочника говорит об этом по-русски', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(seedFoods()).rejects.toThrow(/Не удалось загрузить базу продуктов/)
  })
})
