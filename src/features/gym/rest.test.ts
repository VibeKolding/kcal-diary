import { describe, expect, it } from 'vitest'
import { restLeft, shouldBuzz } from './rest'

describe('таймер отдыха', () => {
  const start = 1_000_000
  const endsAt = start + 90_000

  it('в начале показывает весь отдых, дробные секунды округляет вверх', () => {
    expect(restLeft(endsAt, start)).toBe(90)
    expect(restLeft(endsAt, start + 400)).toBe(90)
    expect(restLeft(endsAt, start + 1000)).toBe(89)
  })

  it('после блокировки экрана считает прошедшее время, а не пропущенные тики', () => {
    // Три секунды отсчёта, затем минута заморозки без единого тика
    expect(restLeft(endsAt, start + 3000 + 60_000)).toBe(27)
  })

  it('после окончания не уходит в минус', () => {
    expect(restLeft(endsAt, endsAt)).toBe(0)
    expect(restLeft(endsAt, endsAt + 45_000)).toBe(0)
  })

  it('вибрирует в срок, но не при возврате к давно закончившемуся отдыху', () => {
    expect(shouldBuzz(endsAt, endsAt + 250)).toBe(true)
    expect(shouldBuzz(endsAt, endsAt + 60_000)).toBe(false)
  })
})
