import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Entry, Nutrients } from '@/domain/types'
import { isMacroBlind } from '@/domain/nutrition'
import { averageMacros, periodTotals, type DayPoint } from './data'

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
