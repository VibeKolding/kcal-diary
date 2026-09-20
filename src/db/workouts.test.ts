import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addSet, bestSet, favoriteIds, groupByDate, restSeconds, setsForExercise, toggleFavorite,
} from './workouts'

describe('журнал подходов', () => {
  beforeEach(async () => { await Promise.all([db.sets.clear(), db.favorites.clear()]) })

  it('пишет подходы и группирует по дате', async () => {
    await addSet('chest-pushup', 0, 15, '2026-09-18')
    await addSet('chest-pushup', 0, 12, '2026-09-18')
    await addSet('chest-pushup', 0, 18, '2026-09-19')
    const rows = await setsForExercise('chest-pushup')
    expect(rows).toHaveLength(3)
    const days = groupByDate(rows)
    expect(days.map((d) => d.date)).toEqual(['2026-09-19', '2026-09-18'])
    expect(days[1]!.sets.map((s) => s.reps)).toEqual([15, 12])
    expect(bestSet(rows)?.reps).toBe(18)
  })

  it('вес округляется до половины килограмма, повторы не меньше одного', async () => {
    const s = await addSet('x', 22.3, 0)
    expect(s.weightKg).toBe(22.5)
    expect(s.reps).toBe(1)
  })

  it('отдых читается из текста', () => {
    expect(restSeconds('60–90 секунд')).toBe(90)
    expect(restSeconds('2–3 минуты')).toBe(180)
    expect(restSeconds('')).toBe(90)
  })

  it('избранное переключается и хранится по видам', async () => {
    expect(await toggleFavorite('food', 'a')).toBe(true)
    await toggleFavorite('exercise', 'chest-pushup')
    expect(await favoriteIds('food')).toEqual(['a'])
    expect(await favoriteIds('exercise')).toEqual(['chest-pushup'])
    expect(await toggleFavorite('food', 'a')).toBe(false)
    expect(await favoriteIds('food')).toEqual([])
  })
})
