import { describe, expect, it } from 'vitest'
import { humanWeeks, movingAverage, weeklyTrend, weeksToTarget } from './weight'

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
