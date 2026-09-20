import { describe, expect, it } from 'vitest'
import { nextAt, nextWaterAt } from './reminders'

describe('напоминания', () => {
  it('ближайшее время — сегодня, если не прошло, иначе завтра', () => {
    const now = new Date(2026, 8, 19, 12, 0)
    expect(new Date(nextAt('20:00', now)).getDate()).toBe(19)
    expect(new Date(nextAt('08:00', now)).getDate()).toBe(20)
  })

  it('вода — по часам кратно шагу, только днём', () => {
    const now = new Date(2026, 8, 19, 22, 30)
    const t = new Date(nextWaterAt(2, now))
    expect(t.getDate()).toBe(20)
    expect(t.getHours()).toBe(9)
    const mid = new Date(nextWaterAt(2, new Date(2026, 8, 19, 12, 10)))
    expect(mid.getHours()).toBe(13)
  })
})
