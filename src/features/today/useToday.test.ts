import { describe, expect, it } from 'vitest'
import { dayKey } from '@/domain/dates'
import { msToNextDay, setViewedDay, viewedDay } from './useToday'

describe('переход на новый день', () => {
  it('таймер срабатывает сразу после полуночи, а не до неё', () => {
    const evening = new Date(2026, 8, 21, 23, 59, 30)
    const at = new Date(evening.getTime() + msToNextDay(evening))
    expect(dayKey(at)).toBe('2026-09-22')
    expect(at.getHours()).toBe(0)
  })

  it('с утра ждёт почти сутки', () => {
    const morning = new Date(2026, 8, 21, 0, 0, 1)
    const hours = msToNextDay(morning) / 3_600_000
    expect(hours).toBeGreaterThan(23.9)
    expect(hours).toBeLessThanOrEqual(24)
  })

  it('переходит через конец месяца и года', () => {
    const nye = new Date(2026, 11, 31, 22, 0, 0)
    expect(dayKey(new Date(nye.getTime() + msToNextDay(nye)))).toBe('2027-01-01')
  })
})

describe('день для «+» в таб-баре', () => {
  it('берёт день, открытый на «Сегодня», а без экрана — сегодняшний', () => {
    setViewedDay('2026-09-20')
    expect(viewedDay()).toBe('2026-09-20')
    setViewedDay(null)
    expect(viewedDay()).toBe(dayKey())
  })
})
