import { describe, expect, it } from 'vitest'
import { goalForecast, humanWeeks, movingAverage, weeklyTrend, weeksToTarget } from './weight'

describe('тренд веса', () => {
  it('считает скорость по прямой, а не по крайним точкам', () => {
    const rows = [
      { date: '2026-09-01', kg: 80 },
      { date: '2026-09-08', kg: 79.5 },
      { date: '2026-09-15', kg: 79 },
      { date: '2026-09-16', kg: 80.2 }, // тяжёлый ужин
    ]
    const t = weeklyTrend(rows)!
    expect(t).toBeLessThan(0)
    expect(t).toBeGreaterThan(-0.5)
  })

  it('молчит, когда точек мало или они слишком близко', () => {
    expect(weeklyTrend([{ date: '2026-09-01', kg: 80 }])).toBeNull()
    expect(weeklyTrend([{ date: '2026-09-01', kg: 80 }, { date: '2026-09-02', kg: 79 }])).toBeNull()
  })

  it('скользящее среднее сглаживает выброс', () => {
    const rows = movingAverage([
      { date: '2026-09-01', kg: 80 },
      { date: '2026-09-02', kg: 80 },
      { date: '2026-09-03', kg: 82 },
    ])
    expect(rows[2]!.avg).toBeCloseTo(80.7, 1)
  })

  it('недели до цели', () => {
    expect(weeksToTarget(80, 75, -0.5)).toBe(10)
    expect(weeksToTarget(80, 75, 0.5)).toBeNull()
    expect(weeksToTarget(80, 80, -0.5)).toBe(0)
    expect(humanWeeks(10)).toBe('≈ 2 месяца')
    expect(humanWeeks(3)).toBe('≈ 3 недели')
  })
})

describe('прогноз до цели', () => {
  it('склоняет месяцы и недели', () => {
    expect(humanWeeks(1)).toBe('≈ 1 неделя')
    expect(humanWeeks(5)).toBe('≈ 5 недель')
    expect(humanWeeks(92)).toBe('≈ 21 месяц')
    expect(humanWeeks(96)).toBe('≈ 22 месяца')
  })

  /* Вес почти стоит — формально «≈ 460 месяцев», по сути бессмыслица */
  it('дальше двух лет не обещает числом', () => {
    expect(weeksToTarget(100, 80, -0.01)).toBe(2000)
    expect(humanWeeks(2000)).toBe('больше двух лет')
    expect(humanWeeks(104)).toBe('≈ 24 месяца')
  })

  const plan = { goal: 'lose' as const, ratePerWeek: 0.5 }

  it('берёт тренд взвешиваний, когда он есть', () => {
    const history = [
      { date: '2026-09-01', kg: 90 },
      { date: '2026-09-08', kg: 89 },
      { date: '2026-09-15', kg: 88 },
    ]
    const f = goalForecast(history, 80, plan)!
    expect(f.basis).toBe('trend')
    expect(f.rate).toBeCloseTo(-1, 5)
    expect(f.weeks).toBe(8)
    expect(f.gapKg).toBe(-8)
  })

  it('без тренда — темп из анкеты', () => {
    const f = goalForecast([{ date: '2026-09-15', kg: 88 }], 80, plan)!
    expect(f.basis).toBe('plan')
    expect(f.rate).toBe(-0.5)
    expect(f.weeks).toBe(16)
  })

  it('без взвешиваний прогноза нет', () => {
    expect(goalForecast([], 80, plan)).toBeNull()
  })
})
