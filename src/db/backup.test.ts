import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addFoodEntry, copyDay, entriesForDay } from './entries'
import { createFood } from './foods'
import { putWeight } from './tracking'
import {
  buildBackup, importBackup, undoRestore, restorePointAt, BackupError,
} from '@/features/backup/backup'
import type { Profile } from '@/domain/types'

const profile: Profile = {
  id: 1, sex: 'male', birthDate: '1990-01-01', heightCm: 180,
  activity: 'light', goal: 'lose', ratePerWeek: 0.5,
  targets: { kcal: 2000, protein: 140, fat: 70, carbs: 210 },
  targetsManual: false, theme: 'dark', waterGoalMl: 2400, createdAt: 1,
}

async function reset() {
  await Promise.all([
    db.profile.clear(), db.foods.clear(), db.recipes.clear(),
    db.entries.clear(), db.weights.clear(), db.water.clear(),
    db.activity.clear(), db.meta.clear(),
  ])
}

function asFile(data: unknown): File {
  return new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' })
}

describe('резервная копия', () => {
  beforeEach(reset)

  /*
   * Восстановление стирает всё и заливает файл. Файл легко перепутать —
   * взять прошлогоднюю копию или копию с другого телефона, — и до точки
   * возврата сегодняшний день исчезал молча и навсегда.
   */
  it('после восстановления можно вернуть как было', async () => {
    await db.profile.put(profile)
    const food = await createFood({
      name: 'Своё блюдо', category: 'dish',
      per100: { kcal: 300, protein: 10, fat: 10, carbs: 40 },
    })
    await addFoodEntry(food, 200, 'lunch', '2026-09-20')
    expect(await entriesForDay('2026-09-20')).toHaveLength(1)

    // чужая копия: другой день, другой продукт
    await importBackup(asFile({
      format: 'kcal-diary-backup', version: 1, exportedAt: '2020-01-01T00:00:00.000Z',
      profile: [profile], foods: [], recipes: [], entries: [], weights: [], water: [],
    }))
    expect(await entriesForDay('2026-09-20')).toHaveLength(0)
    expect(await restorePointAt()).toBeTypeOf('number')

    await undoRestore()
    expect(await entriesForDay('2026-09-20')).toHaveLength(1)
    // второй раз возвращать уже нечего
    expect(await restorePointAt()).toBeNull()
    await expect(undoRestore()).rejects.toBeInstanceOf(BackupError)
  })

  /* Первое восстановление на чистом телефоне — обычный сценарий переезда,
     а не ошибка: предлагать «вернуть как было» там не к чему. */
  it('на пустом дневнике точка возврата не заводится', async () => {
    await importBackup(asFile({
      format: 'kcal-diary-backup', version: 1, exportedAt: '2026-01-01T00:00:00.000Z',
      profile: [profile], foods: [], recipes: [], entries: [], weights: [], water: [],
    }))
    expect(await restorePointAt()).toBeNull()
  })

  it('переживает круг экспорт → очистка → импорт', async () => {
    await db.profile.put(profile)
    const food = await createFood({
      name: 'Мой пирог', category: 'sweet',
      per100: { kcal: 400, protein: 5, fat: 20, carbs: 50 },
    })
    await addFoodEntry(food, 150, 'dinner', '2026-09-07')
    await putWeight({ date: '2026-09-07', kg: 80 })

    const backup = await buildBackup()

    await reset()
    expect(await db.entries.count()).toBe(0)

    const result = await importBackup(asFile(backup))

    expect(result.entries).toBe(1)
    expect(await db.profile.get(1)).toEqual(profile)

    const entries = await entriesForDay('2026-09-07')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.title).toBe('Мой пирог')
    expect(entries[0]!.grams).toBe(150)
    expect(entries[0]!.per100.kcal).toBe(400)
    expect((await db.weights.get('2026-09-07'))?.kg).toBe(80)
  })

  /**
   * Импорт — единственное место, куда в приложение попадает файл извне.
   * Огромный файл нельзя даже пытаться разобрать: JSON.parse затянет его
   * в память целиком и подвесит устройство.
   */
  it('отвергает подозрительно большой файл, не читая его', async () => {
    const huge = new File(['{}'], 'backup.json', { type: 'application/json' })
    Object.defineProperty(huge, 'size', { value: 80 * 1024 * 1024 })
    await expect(importBackup(huge)).rejects.toThrow(/слишком большой/)
  })

  it('отвергает чужой файл, не тронув данные', async () => {
    await db.profile.put(profile)
    await expect(importBackup(asFile({ foo: 'bar' }))).rejects.toBeInstanceOf(BackupError)
    expect(await db.profile.get(1)).toEqual(profile)
  })

  it('отвергает копию от более новой версии формата', async () => {
    const backup = await buildBackup()
    await expect(
      importBackup(asFile({ ...backup, version: 99 })),
    ).rejects.toThrow(/более новой версией/)
  })

  /**
   * Тренировки убраны из интерфейса, но копии, снятые раньше, должны
   * читаться — иначе обновление приложения обесценит старые бэкапы.
   */
  it('читает копию без раздела тренировок', async () => {
    await db.profile.put(profile)
    const backup = await buildBackup()
    const { activity, ...withoutActivity } = backup
    void activity

    await reset()
    await expect(importBackup(asFile(withoutActivity))).resolves.toBeTruthy()
    expect(await db.profile.get(1)).toEqual(profile)
  })

  it('отвергает копию с повреждённым разделом', async () => {
    const backup = await buildBackup()
    await expect(
      importBackup(asFile({ ...backup, entries: 'сломано' })),
    ).rejects.toThrow(/entries/)
  })

  it('не раздувает файл вшитой базой продуктов', async () => {
    await db.foods.bulkPut(
      Array.from({ length: 50 }, (_, i) => ({
        id: `b${i}`, name: `Продукт ${i}`,
        per100: { kcal: 100, protein: 1, fat: 1, carbs: 1 },
        servings: [], category: 'other' as const, source: 'builtin' as const,
        usageCount: 0, lastUsedAt: 0,
      })),
    )
    const backup = await buildBackup()
    expect(backup.foods).toHaveLength(0)
  })

  it('сохраняет вшитый продукт, если им пользовались', async () => {
    await db.foods.put({
      id: 'b1', name: 'Гречка',
      per100: { kcal: 110, protein: 4.2, fat: 1.1, carbs: 21.3 },
      servings: [], category: 'grain', source: 'builtin',
      usageCount: 3, lastUsedAt: 100,
    })
    const backup = await buildBackup()
    expect(backup.foods.map((f) => f.id)).toEqual(['b1'])
  })
})

describe('записи дневника', () => {
  beforeEach(reset)

  it('хранят снимок: правка продукта не переписывает историю', async () => {
    const food = await createFood({
      name: 'Йогурт', category: 'dairy',
      per100: { kcal: 100, protein: 5, fat: 3, carbs: 10 },
    })
    await addFoodEntry(food, 200, 'breakfast', '2026-09-07')

    // Пользователь уточнил состав продукта уже после того, как его съел
    await db.foods.update(food.id, {
      per100: { kcal: 250, protein: 5, fat: 3, carbs: 10 },
    })

    const entries = await entriesForDay('2026-09-07')
    expect(entries[0]!.per100.kcal).toBe(100)
  })

  it('считает использование продукта для блока «недавнее»', async () => {
    const food = await createFood({
      name: 'Кофе', category: 'drink',
      per100: { kcal: 2, protein: 0, fat: 0, carbs: 0 },
    })
    await addFoodEntry(food, 200, 'breakfast', '2026-09-07')
    await addFoodEntry(food, 200, 'snack', '2026-09-07')
    expect((await db.foods.get(food.id))?.usageCount).toBe(2)
  })

  it('копирует день целиком новыми записями', async () => {
    const food = await createFood({
      name: 'Хлеб', category: 'bread',
      per100: { kcal: 250, protein: 8, fat: 3, carbs: 49 },
    })
    await addFoodEntry(food, 30, 'breakfast', '2026-09-06')
    await addFoodEntry(food, 60, 'dinner', '2026-09-06')

    const copied = await copyDay('2026-09-06', '2026-09-07')

    expect(copied).toBe(2)
    const src = await entriesForDay('2026-09-06')
    const dst = await entriesForDay('2026-09-07')
    expect(dst).toHaveLength(2)
    // Идентификаторы новые — правка копии не должна менять оригинал
    expect(dst.map((e) => e.id)).not.toEqual(src.map((e) => e.id))
    expect(dst.map((e) => e.grams).sort()).toEqual([30, 60])
  })

  it('копирует только один приём пищи, если он указан', async () => {
    const food = await createFood({
      name: 'Рис', category: 'grain',
      per100: { kcal: 130, protein: 2.4, fat: 0.2, carbs: 28.7 },
    })
    await addFoodEntry(food, 100, 'breakfast', '2026-09-06')
    await addFoodEntry(food, 200, 'dinner', '2026-09-06')

    expect(await copyDay('2026-09-06', '2026-09-07', 'dinner')).toBe(1)
    expect(await entriesForDay('2026-09-07')).toHaveLength(1)
  })

  it('на пустом дне ничего не копирует', async () => {
    expect(await copyDay('2026-09-01', '2026-09-07')).toBe(0)
  })
})
