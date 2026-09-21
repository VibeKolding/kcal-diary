import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { KcalDB } from './db'

/*
 * Схема версии 1 — это то, что лежит у первых пользователей. Обновление
 * до версии 2 не должно терять ни записи, ни профиль: таблицы добавляются,
 * старые Dexie переносит как есть.
 */
describe('обновление схемы базы', () => {
  it('открывает базу версии 1 без потерь и добавляет новые таблицы', async () => {
    const old = new Dexie('kcal-diary')
    old.version(1).stores({
      profile: 'id',
      foods: 'id, name, barcode, category, source, lastUsedAt, usageCount',
      recipes: 'id, name, createdAt',
      entries: 'id, date, [date+meal], createdAt, refId',
      weights: 'date',
      water: 'date',
      activity: 'id, date',
      meta: 'key',
    })
    await old.table('entries').put({ id: 'e1', date: '2026-01-01', meal: 'lunch', createdAt: 1 })
    await old.table('weights').put({ date: '2026-01-01', kg: 80 })
    old.close()

    const db = new KcalDB()
    expect(await db.entries.get('e1')).toMatchObject({ date: '2026-01-01' })
    expect((await db.weights.get('2026-01-01'))?.kg).toBe(80)
    expect(await db.notes.count()).toBe(0)
    expect(await db.favorites.count()).toBe(0)
    expect(db.verno).toBe(2)
    db.close()
  })
})
