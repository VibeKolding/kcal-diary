import { describe, expect, it } from 'vitest'
import { accuracy, averageKcal, bestStreak, currentStreak, verdict } from './streaks'
import type { DayStat } from './streaks'

function day(date: string, kcal: number, target = 2000): DayStat {
  return { date, kcal, target, logged: kcal > 0 }
}

describe('verdict', () => {
  it('коридор ±10 % считает попаданием', () => {
    expect(verdict(day('2026-09-07', 2000))).toBe('onTarget')
    expect(verdict(day('2026-09-07', 1850))).toBe('onTarget')
    expect(verdict(day('2026-09-07', 2150))).toBe('onTarget')
  })

  it('различает недобор и перебор', () => {
    expect(verdict(day('2026-09-07', 1400))).toBe('under')
    expect(verdict(day('2026-09-07', 2600))).toBe('over')
  })

  it('день без записей помечает пустым', () => {
    expect(verdict(day('2026-09-07', 0))).toBe('empty')
  })
})

describe('currentStreak', () => {
  it('считает непрерывную серию до сегодня', () => {
    const stats = [
      day('2026-09-04', 1900), day('2026-09-05', 2000),
      day('2026-09-06', 2100), day('2026-09-07', 1950),
    ]
    expect(currentStreak(stats, '2026-09-07')).toBe(4)
  })

  it('пустой сегодняшний день не обрывает серию', () => {
    const stats = [
      day('2026-09-05', 2000), day('2026-09-06', 2100), day('2026-09-07', 0),
    ]
    expect(currentStreak(stats, '2026-09-07')).toBe(2)
  })

  it('пропуск позавчера обрывает серию', () => {
    const stats = [
      day('2026-09-04', 2000), day('2026-09-05', 0),
      day('2026-09-06', 2100), day('2026-09-07', 1950),
    ]
    expect(currentStreak(stats, '2026-09-07')).toBe(2)
  })

  it('на пустой истории даёт ноль', () => {
    expect(currentStreak([], '2026-09-07')).toBe(0)
  })
})

describe('bestStreak', () => {
  it('находит самую длинную серию в истории', () => {
    const stats = [
      day('2026-09-01', 2000), day('2026-09-02', 2000), day('2026-09-03', 2000),
      day('2026-09-04', 0),
      day('2026-09-05', 2000), day('2026-09-06', 2000),
    ]
    expect(bestStreak(stats)).toBe(3)
  })
})

describe('accuracy', () => {
  it('считает долю попаданий только среди дней с записями', () => {
    const stats = [
      day('2026-09-05', 2000), day('2026-09-06', 3000), day('2026-09-07', 0),
    ]
    expect(accuracy(stats)).toBe(0.5)
  })

  it('без записей возвращает ноль, а не делит на ноль', () => {
    expect(accuracy([day('2026-09-07', 0)])).toBe(0)
  })
})

describe('averageKcal', () => {
  it('усредняет только дни с записями', () => {
    const stats = [day('2026-09-05', 2000), day('2026-09-06', 3000), day('2026-09-07', 0)]
    expect(averageKcal(stats)).toBe(2500)
  })
})
