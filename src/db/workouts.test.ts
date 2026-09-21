import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addSet, bestSet, deleteSet, exerciseLog, favoriteIds, groupByDate, restoreSet, restSeconds,
  setsForExercise, toggleFavorite,
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

  it('два быстрых касания звезды ставят и снимают отметку, а не ставят дважды', async () => {
    const [first, second] = await Promise.all([
      toggleFavorite('exercise', 'chest-pushup'),
      toggleFavorite('exercise', 'chest-pushup'),
    ])
    expect([first, second]).toEqual([true, false])
    expect(await favoriteIds('exercise')).toEqual([])
  })

  it('рекорд считается по всем подходам, а не по показанным', async () => {
    // Самый старый подход — лучший, за ним 34 подхода полегче
    await db.sets.put({ id: 's-old', date: '2026-08-01', exerciseId: 'deadlift', weightKg: 100, reps: 5, createdAt: 1 })
    for (let i = 0; i < 34; i++) {
      await db.sets.put({ id: `s${i}`, date: '2026-09-01', exerciseId: 'deadlift', weightKg: 50, reps: 10, createdAt: 100 + i })
    }
    const log = await exerciseLog('deadlift')
    expect(log.sets).toHaveLength(30)
    expect(log.sets.some((x) => x.id === 's-old')).toBe(false)
    expect(log.best).toMatchObject({ weightKg: 100, reps: 5 })
    expect(await setsForExercise('deadlift')).toHaveLength(30)
  })

  it('удалённый подход возвращается «Отменить» с тем же id и датой', async () => {
    const s = await addSet('squat', 60, 8, '2026-09-18')
    await deleteSet(s.id)
    expect(await setsForExercise('squat')).toEqual([])
    await restoreSet(s)
    expect(await setsForExercise('squat')).toEqual([s])
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
