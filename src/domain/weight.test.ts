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

  const NOW = new Date('2026-09-15T12:00:00')
  const plan = { goal: 'lose' as const, ratePerWeek: 0.5, heightCm: 180, birthDate: '1990-01-01' }

  it('берёт тренд взвешиваний, когда он есть', () => {
    const history = [
      { date: '2026-09-01', kg: 90 },
      { date: '2026-09-08', kg: 89 },
      { date: '2026-09-15', kg: 88 },
    ]
    const f = goalForecast(history, 80, plan, NOW)!
    expect(f.basis).toBe('trend')
    expect(f.rate).toBeCloseTo(-1, 5)
    expect(f.weeks).toBe(8)
    expect(f.gapKg).toBe(-8)
  })

  it('без тренда — темп из анкеты', () => {
    const f = goalForecast([{ date: '2026-09-15', kg: 88 }], 80, plan, NOW)!
    expect(f.basis).toBe('plan')
    expect(f.rate).toBe(-0.5)
    expect(f.weeks).toBe(16)
    expect(f.limitedBy).toBeNull()
  })

  /*
   * Прогноз по анкете раньше брал темп как есть: подросток с «1 кг в неделю»
   * видел срок вчетверо короче, чем позволяет его норма.
   */
  it('по анкете берёт темп после пределов, как и норма', () => {
    const teen = { ...plan, ratePerWeek: 1, heightCm: 175, birthDate: '2010-03-01' }
    const f = goalForecast([{ date: '2026-09-15', kg: 70 }], 65, teen, NOW)!
    expect(f.basis).toBe('plan')
    expect(f.rate).toBe(-0.25)
    expect(f.weeks).toBe(20)
    expect(f.limitedBy).toBe('teen')

    // Взрослый при 60 кг — не больше 1 % массы в неделю, то есть 0,6 кг
    const adult = { ...plan, ratePerWeek: 1, heightCm: 170 }
    const g = goalForecast([{ date: '2026-09-15', kg: 60 }], 54, adult, NOW)!
    expect(g.rate).toBeCloseTo(-0.6, 9)
    expect(g.weeks).toBe(10)
    expect(g.limitedBy).toBe('share')
  })

  it('при недостатке веса не обещает снижение по анкете', () => {
    const f = goalForecast([{ date: '2026-09-15', kg: 55 }], 50, plan, NOW)!
    expect(f.basis).toBe('plan')
    expect(f.rate).toBe(0)
    expect(f.weeks).toBeNull()
    expect(f.limitedBy).toBe('underweight')
  })

  it('возраст считает на сегодня: в день 18-летия предел снимается', () => {
    const teen = { ...plan, ratePerWeek: 0.5, heightCm: 175, birthDate: '2008-09-16' }
    const history = [{ date: '2026-09-15', kg: 70 }]
    expect(goalForecast(history, 65, teen, new Date('2026-09-15T12:00:00'))!.rate).toBe(-0.25)
    expect(goalForecast(history, 65, teen, new Date('2026-09-16T12:00:00'))!.rate).toBe(-0.5)
  })

  it('настоящий тренд пределы не трогают', () => {
    const history = [
      { date: '2026-09-01', kg: 57 },
      { date: '2026-09-08', kg: 56 },
      { date: '2026-09-15', kg: 55 },
    ]
    const f = goalForecast(history, 50, plan, NOW)!
    expect(f.basis).toBe('trend')
    expect(f.rate).toBeCloseTo(-1, 5)
    expect(f.weeks).toBe(5)
    expect(f.limitedBy).toBeNull()
  })

  it('без взвешиваний прогноза нет', () => {
    expect(goalForecast([], 80, plan, NOW)).toBeNull()
  })
})
