import { describe, expect, it } from 'vitest'
import { mealForTime } from './meal'

const at = (h: number, m = 0) => new Date(2026, 8, 21, h, m)

describe('приём пищи по времени суток', () => {
  it('утро — завтрак, день — обед, вечер — ужин', () => {
    expect(mealForTime(at(7, 30))).toBe('breakfast')
    expect(mealForTime(at(13))).toBe('lunch')
    expect(mealForTime(at(19))).toBe('dinner')
  })

  it('границы те же, что у каталога блюд', () => {
    expect(mealForTime(at(10, 59))).toBe('breakfast')
    expect(mealForTime(at(11))).toBe('lunch')
    expect(mealForTime(at(15, 59))).toBe('lunch')
    expect(mealForTime(at(16))).toBe('dinner')
  })

  it('поздний вечер и ночь — перекус', () => {
    expect(mealForTime(at(22, 30))).toBe('snack')
    expect(mealForTime(at(0, 15))).toBe('snack')
    expect(mealForTime(at(3, 59))).toBe('snack')
    expect(mealForTime(at(4))).toBe('breakfast')
  })
})
