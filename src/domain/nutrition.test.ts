import { describe, expect, it } from 'vitest'
import { deviation, kcalFromMacros, scale, sumByMeal, sumEntries } from './nutrition'
import type { Entry } from './types'

const per100 = { kcal: 200, protein: 10, fat: 5, carbs: 30 }

function entry(over: Partial<Entry>): Entry {
  return {
    id: 'e1', date: '2026-09-07', meal: 'breakfast', title: 'Тест',
    category: 'other', grams: 100, per100, createdAt: 0, ...over,
  }
}

describe('scale', () => {
  it('приводит значения на 100 г к фактическому весу', () => {
    expect(scale(per100, 250)).toEqual({ kcal: 500, protein: 25, fat: 12.5, carbs: 75 })
  })

  it('на нулевом весе даёт нули', () => {
    expect(scale(per100, 0)).toEqual({ kcal: 0, protein: 0, fat: 0, carbs: 0 })
  })
})

describe('sumEntries', () => {
  it('складывает записи с разным весом', () => {
    const total = sumEntries([entry({ grams: 100 }), entry({ id: 'e2', grams: 50 })])
    expect(total.kcal).toBe(300)
    expect(total.protein).toBe(15)
  })

  it('на пустом списке даёт нули', () => {
    expect(sumEntries([])).toEqual({ kcal: 0, protein: 0, fat: 0, carbs: 0 })
  })
})

describe('sumByMeal', () => {
  it('раскладывает записи по приёмам пищи', () => {
    const byMeal = sumByMeal([
      entry({ meal: 'breakfast', grams: 100 }),
      entry({ id: 'e2', meal: 'dinner', grams: 200 }),
    ])
    expect(byMeal.breakfast.kcal).toBe(200)
    expect(byMeal.dinner.kcal).toBe(400)
    expect(byMeal.lunch.kcal).toBe(0)
    expect(byMeal.snack.kcal).toBe(0)
  })
})

describe('kcalFromMacros', () => {
  it('считает калорийность по формуле 4/9/4', () => {
    expect(kcalFromMacros({ protein: 10, fat: 5, carbs: 30 })).toBe(205)
  })
})

describe('deviation', () => {
  it('считает перебор и недобор в единицах нормы', () => {
    expect(deviation(208, 82)).toEqual({ kind: 'over', amount: 126 })
    expect(deviation(40, 131)).toEqual({ kind: 'under', amount: 91 })
  })

  it('коридор ±10 % считает попаданием', () => {
    expect(deviation(298, 292).kind).toBe('onTarget')
    expect(deviation(2750, 2500).kind).toBe('onTarget')
    expect(deviation(2250, 2500).kind).toBe('onTarget')
  })

  it('за границей коридора — промах', () => {
    expect(deviation(2751, 2500).kind).toBe('over')
    expect(deviation(2249, 2500).kind).toBe('under')
  })

  it('без нормы сравнивать не с чем', () => {
    expect(deviation(120, 0)).toEqual({ kind: 'none', amount: 0 })
  })

  it('округляет отклонение до целого', () => {
    expect(deviation(82.4, 40).amount).toBe(42)
  })
})
