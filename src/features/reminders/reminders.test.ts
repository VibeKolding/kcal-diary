import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entry } from '@/domain/types'
import { isLate, LATE_MS, nextAt, nextWait, nextWaterAt, schedule, STEP_MS, type ReminderSettings } from './reminders'

// Дневник в тестах планировщика — управляемое обещание: так видно, что
// делает планировщик, пока срабатывание ждёт ответа базы
let answer: ((rows: Entry[]) => void) | null = null
vi.mock('@/db/entries', () => ({
  entriesForDay: () => new Promise<Entry[]>((resolve) => { answer = resolve }),
}))

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

  it('опоздание больше допуска или через полночь — пропуск', () => {
    const when = new Date(2026, 8, 19, 20, 0).getTime()
    expect(isLate(when, when + 2 * 60_000)).toBe(false)
    expect(isLate(when, when + LATE_MS + 1)).toBe(true)
    // Проснулись утром: вчерашнее «дневник пуст» уже не к месту
    expect(isLate(when, new Date(2026, 8, 20, 8, 0).getTime())).toBe(true)
    const late = new Date(2026, 8, 19, 23, 55).getTime()
    expect(isLate(late, late + 10 * 60_000)).toBe(true)
  })

  it('долгое ожидание режется на отрезки, просроченное — сразу', () => {
    const now = new Date(2026, 8, 19, 12, 0).getTime()
    expect(nextWait(now + 8 * 3600_000, now)).toBe(STEP_MS)
    expect(nextWait(now + 60_000, now)).toBe(60_000)
    expect(nextWait(now - 60_000, now)).toBe(0)
  })
})

describe('планировщик', () => {
  const shown: string[] = []
  const settings: ReminderSettings = { enabled: true, mealAt: '20:00', waterEveryH: 0, weighAt: '' }
  // Ответ базы идёт через обещания: даём им отработать
  const settle = () => new Promise((r) => setImmediate(r))

  beforeEach(() => {
    shown.length = 0
    answer = null
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('Notification', class {
      static permission = 'granted'
      constructor(title: string) { shown.push(title) }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('срабатывает в срок', async () => {
    vi.setSystemTime(new Date(2026, 8, 19, 19, 58))
    const stop = schedule(settings, 2000)
    vi.advanceTimersByTime(2 * 60_000)
    answer!([])
    await settle()
    expect(shown).toEqual(['Дневник за сегодня пуст'])
    stop()
  })

  it('после сна не срабатывает задним числом, а ждёт следующего срока', async () => {
    vi.setSystemTime(new Date(2026, 8, 19, 19, 0))
    const stop = schedule(settings, 2000)
    // Телефон спал до утра: таймеры всё это время стояли
    vi.setSystemTime(new Date(2026, 8, 20, 8, 0))
    vi.advanceTimersByTime(STEP_MS)
    await settle()
    expect(answer).toBeNull()
    expect(shown).toEqual([])
    // Следующий срок — сегодня вечером, а не через час, когда досчитал бы
    // заснувший вечерний таймер
    vi.advanceTimersByTime(3 * 3600_000)
    await settle()
    expect(answer).toBeNull()
    expect(vi.getTimerCount()).toBe(1)
    stop()
  })

  it('остановка во время срабатывания не оставляет живой цепочки', async () => {
    vi.setSystemTime(new Date(2026, 8, 19, 19, 59))
    const stop = schedule(settings, 2000)
    vi.advanceTimersByTime(60_000)
    // Срабатывание ждёт базу, и в этот момент напоминания выключают
    stop()
    answer!([])
    await settle()
    expect(shown).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
