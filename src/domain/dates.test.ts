import { describe, expect, it } from 'vitest'
import { dayKey, humanDay, lastDays, shiftDay, weekdayIndex } from './dates'

describe('dayKey', () => {
  it('форматирует по локальному времени, без сдвига в UTC', () => {
    // 23:30 по местному времени всё ещё тот же день
    expect(dayKey(new Date(2026, 8, 7, 23, 30))).toBe('2026-09-07')
  })

  it('дополняет месяц и день нулями', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('shiftDay', () => {
  it('переходит через границу месяца', () => {
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('переходит через границу года', () => {
    expect(shiftDay('2025-12-31', 1)).toBe('2026-01-01')
  })

  it('учитывает високосный год', () => {
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('lastDays', () => {
  it('возвращает n дней по возрастанию, включая текущий', () => {
    expect(lastDays(3, '2026-09-07')).toEqual(['2026-09-05', '2026-09-06', '2026-09-07'])
  })
})

describe('humanDay', () => {
  it('называет сегодня и вчера словами', () => {
    expect(humanDay('2026-09-07', '2026-09-07')).toBe('Сегодня')
    expect(humanDay('2026-09-06', '2026-09-07')).toBe('Вчера')
  })

  it('остальные дни показывает датой', () => {
    expect(humanDay('2026-09-01', '2026-09-07')).toBe('1 сентября')
  })
})

describe('weekdayIndex', () => {
  it('считает понедельник первым днём недели', () => {
    // 7 сентября 2026 — понедельник
    expect(weekdayIndex('2026-09-07')).toBe(0)
    expect(weekdayIndex('2026-09-13')).toBe(6)
  })
})
