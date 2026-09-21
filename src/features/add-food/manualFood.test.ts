import { describe, expect, it } from 'vitest'
import { per100Problem } from './manualFood'

const food = (kcal: number, protein = 0, fat = 0, carbs = 0) => ({ kcal, protein, fat, carbs })

describe('правдоподобие своего продукта', () => {
  it('обычные продукты проходят', () => {
    expect(per100Problem(food(250, 7, 12, 30))).toBeNull()
    // Масло — предел: почти весь вес жир
    expect(per100Problem(food(899, 0, 99.9, 0))).toBeNull()
    expect(per100Problem(food(900, 0, 100, 0))).toBeNull()
  })

  it('больше 900 ккал на 100 г — опечатка', () => {
    expect(per100Problem(food(2500))).toMatch(/900 ккал/)
  })

  it('нутриента не может быть больше 100 г', () => {
    expect(per100Problem(food(400, 500))).toMatch(/больше 100 г/)
  })

  it('сумма БЖУ не больше 100 г', () => {
    expect(per100Problem(food(500, 40, 40, 40))).toMatch(/вместе/)
  })

  it('округление плавающей точки не считается перебором', () => {
    expect(per100Problem(food(400, 33.3, 33.3, 33.4))).toBeNull()
  })
})
