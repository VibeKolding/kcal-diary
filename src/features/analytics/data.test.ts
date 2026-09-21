import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Entry, Nutrients, Profile } from '@/domain/types'
import { isMacroBlind } from '@/domain/nutrition'
import { dayKey, parseDay, shiftDay } from '@/domain/dates'
import { db } from '@/db/db'
import { addQuickEntry } from '@/db/entries'
import {
  averageMacros, buildReport, diaryStart, diaryStreaks, missedDays, periodTotals, type DayPoint,
} from './data'

function entry(over: Partial<Entry>): Entry {
  return {
    id: 'e1', date: '2026-09-19', meal: 'snack', title: 'x', category: 'other',
    grams: 100, per100: { kcal: 100, protein: 10, fat: 5, carbs: 20 },
    createdAt: 0, ...over,
  }
}

function point(over: Partial<DayPoint>): DayPoint {
  const nutrients: Nutrients = { kcal: 2000, protein: 100, fat: 60, carbs: 200 }
  return { date: '2026-09-19', kcal: 2000, target: 2000, logged: true, nutrients, macrosKnown: true, ...over }
}

describe('записи без состава', () => {
  it('быстрая запись с флагом — без состава', () => {
    expect(isMacroBlind(entry({ noMacros: true, per100: { kcal: 150, protein: 0, fat: 0, carbs: 0 } }))).toBe(true)
  })

  it('старая быстрая запись без флага узнаётся по отсутствию продукта', () => {
    expect(isMacroBlind(entry({ per100: { kcal: 150, protein: 0, fat: 0, carbs: 0 } }))).toBe(true)
  })

  it('быстрая запись с указанным составом считается полноценной', () => {
    expect(isMacroBlind(entry({ per100: { kcal: 150, protein: 12, fat: 0, carbs: 0 } }))).toBe(false)
  })

  it('продукт из базы с нулевым БЖУ — не пробел в данных', () => {
    expect(isMacroBlind(entry({ refId: 'f1', per100: { kcal: 0, protein: 0, fat: 0, carbs: 0 } }))).toBe(false)
  })
})

describe('средние БЖУ', () => {
  it('дни с неизвестным составом не идут в расчёт', () => {
    const r = averageMacros([
      point({ date: '2026-09-17' }),
      point({ date: '2026-09-18', macrosKnown: false }),
      point({ date: '2026-09-19' }),
    ])
    expect(r.days).toBe(2)
    expect(r.skipped).toBe(1)
    expect(Math.round(r.macros.protein)).toBe(100)
  })

  it('дни без записей не считаются пропущенными', () => {
    const r = averageMacros([point({}), point({ date: '2026-09-18', logged: false })])
    expect(r.days).toBe(1)
    expect(r.skipped).toBe(0)
  })

  it('когда считать не из чего, возвращаются нули и число пропусков', () => {
    const r = averageMacros([point({ macrosKnown: false })])
    expect(r.days).toBe(0)
    expect(r.skipped).toBe(1)
    expect(r.macros.protein).toBe(0)
  })
})

describe('periodTotals', () => {
  const targets: Nutrients = { kcal: 2500, protein: 130, fat: 80, carbs: 290 }
  const day = (kcal: number, over: Partial<DayPoint> = {}): DayPoint =>
    point({ kcal, target: 2500, nutrients: { kcal, protein: 100, fat: 80, carbs: 290 }, ...over })

  it('качели схлопываются в итог: перебор одних дней гасится недобором других', () => {
    const t = periodTotals([day(3000), day(3500), day(4000), day(2000), day(2000), day(1500), day(1500)], targets)
    expect(t.kcal.value).toBe(17500)
    expect(t.kcal.target).toBe(17500)
    expect(t.over).toBe(3)
    expect(t.under).toBe(4)
    expect(t.onTarget).toBe(0)
  })

  it('норма считается только за дни с записями', () => {
    const t = periodTotals([day(2500), day(2500), point({ logged: false, kcal: 0 })], targets)
    expect(t.days).toBe(2)
    expect(t.total).toBe(3)
    expect(t.kcal.target).toBe(5000)
  })

  it('дни без состава не идут в БЖУ, но идут в калории', () => {
    const t = periodTotals([day(2500), day(2500, { macrosKnown: false })], targets)
    expect(t.kcal.value).toBe(5000)
    expect(t.macroDays).toBe(1)
    expect(t.macroSkipped).toBe(1)
    expect(t.protein).toEqual({ value: 100, target: 130 })
    expect(t.fat).toEqual({ value: 80, target: 80 })
  })

  it('пустой период не делит на ноль', () => {
    const t = periodTotals([point({ logged: false, kcal: 0 })], targets)
    expect(t).toMatchObject({ days: 0, kcal: { value: 0, target: 0 }, macroDays: 0 })
  })
})

describe('серии дневника', () => {
  const today = '2026-09-21'
  const run = (from: string, n: number) => Array.from({ length: n }, (_, i) => shiftDay(from, i))

  it('считаются по всей истории, а не по выбранному периоду', () => {
    // Двенадцать дней подряд по вчерашний день: неделя их не обрезает
    const r = diaryStreaks(run('2026-09-09', 12), today)
    expect(r).toEqual({ current: 12, best: 12 })
  })

  it('рекорд помнит давнюю серию, текущая — только свежую', () => {
    const r = diaryStreaks([...run('2026-06-01', 40), ...run('2026-09-19', 3)], today)
    expect(r).toEqual({ current: 3, best: 40 })
  })

  it('пустой сегодняшний день серию не обрывает, пустой вчерашний — обрывает', () => {
    expect(diaryStreaks(run('2026-09-18', 3), today).current).toBe(3)
    expect(diaryStreaks(run('2026-09-15', 5), today).current).toBe(0)
    expect(diaryStreaks([], today)).toEqual({ current: 0, best: 0 })
  })
})

describe('пропущенные дни', () => {
  const today = '2026-09-21'
  const days = (logged: boolean[]) => logged.map((l, i) =>
    point({ date: shiftDay(today, i - logged.length + 1), logged: l }))

  it('не считает дни до начала дневника', () => {
    // Месяц, дневник начат пять дней назад и ведётся каждый день
    const pts = days([...Array<boolean>(25).fill(false), ...Array<boolean>(5).fill(true)])
    expect(missedDays(pts, shiftDay(today, -4), today)).toBe(0)
  })

  it('не считает пустое сегодня, пока день не кончился', () => {
    expect(missedDays(days([true, false, true, false]), null, today)).toBe(1)
  })

  it('начало дневника — создание профиля или первая запись, что раньше', () => {
    const created = new Date(2026, 8, 10, 15, 30).getTime()
    const p = { createdAt: created } as Profile
    expect(diaryStart(p, undefined)).toBe('2026-09-10')
    expect(diaryStart(p, '2026-09-12')).toBe('2026-09-10')
    // Записи из резервной копии старше профиля
    expect(diaryStart(p, '2026-05-01')).toBe('2026-05-01')
  })
})

describe('отчёт целиком', () => {
  const today = dayKey()
  const profile: Profile = {
    id: 1, sex: 'male', birthDate: '1990-01-01', heightCm: 180,
    activity: 'light', goal: 'lose', ratePerWeek: 0.5,
    targets: { kcal: 2000, protein: 140, fat: 70, carbs: 210 },
    targetsManual: false, theme: 'dark', waterGoalMl: 2400,
    createdAt: parseDay(shiftDay(today, -20)).getTime(),
  }

  beforeEach(async () => {
    await Promise.all([db.entries.clear(), db.weights.clear(), db.water.clear()])
  })

  it('серия за неделю не упирается в семь дней', async () => {
    for (let i = 1; i <= 12; i++) await addQuickEntry(1800, 'lunch', shiftDay(today, -i))
    const r = await buildReport(profile, 7)
    expect(r.streaks).toEqual({ current: 12, best: 12 })
    // Сегодня ещё пусто, но это не пропуск
    expect(r.missed).toBe(0)
  })

  it('прогноз до цели — общий, по последним взвешиваниям, а не по периоду', async () => {
    const target = { ...profile, targetWeightKg: 75 }
    // Взвешивания месяц назад, за неделю — ни одного: тренд периода пуст,
    // а прогноз всё равно есть и совпадает с «Сегодня» и профилем
    for (let i = 0; i < 5; i++) await db.weights.put({ date: shiftDay(today, -30 - i * 3), kg: 80 + i * 0.3 })
    const r = await buildReport(target, 7)
    expect(r.weights).toHaveLength(0)
    expect(r.forecast).toMatchObject({ currentKg: 80, gapKg: -5, basis: 'trend' })
    expect(r.forecast?.weeks).toBeGreaterThan(0)
    // Без целевого веса прогноза нет
    expect((await buildReport(profile, 7)).forecast).toBeNull()
  })

  it('вес и вода приходят и без записей еды', async () => {
    for (let i = 0; i < 7; i++) {
      await db.weights.put({ date: shiftDay(today, -i), kg: 80 - i / 10 })
      await db.water.put({ date: shiftDay(today, -i), ml: 1500 })
    }
    const r = await buildReport(profile, 7)
    expect(r.points.some((p) => p.logged)).toBe(false)
    expect(r.weights).toHaveLength(7)
    expect(r.water).toHaveLength(7)
  })
})
