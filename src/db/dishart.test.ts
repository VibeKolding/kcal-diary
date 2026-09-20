import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dishTokens, isBowl, tokenFor, type CatalogRecipe } from './catalog'

const recipes = (JSON.parse(readFileSync('public/data/recipes.json', 'utf8')) as {
  items: CatalogRecipe[]
}).items

const byTitle = (t: string) => recipes.find((r) => r.title === t)!

describe('состав картинки блюда', () => {
  it('узнаёт продукты по названию', () => {
    expect(tokenFor('Куриная грудка сырая')).toBe('chicken')
    expect(tokenFor('Гречка сухая')).toBe('grain')
    expect(tokenFor('Творог 9%')).toBe('dairy')
    expect(tokenFor('Лосось запечённый')).toBe('fish')
    expect(tokenFor('Брокколи')).toBe('broccoli')
  })

  it('на незнакомом продукте не падает', () => {
    expect(tokenFor('Марсианский лишайник')).toBeNull()
  })

  /**
   * Пустая обложка выглядит как ошибка загрузки, поэтому в каждом рецепте
   * должен опознаваться хотя бы один продукт.
   */
  it('у каждого рецепта есть хотя бы одна составляющая', () => {
    for (const r of recipes) {
      expect(dishTokens(r).length, r.title).toBeGreaterThan(0)
    }
  })

  it('берёт составляющие по весу, самое тяжёлое первым', () => {
    const r = byTitle('Куриная грудка с гречкой и брокколи')
    // брокколи 150 г, куриная грудка 130 г... в этом рецепте 150/50/150
    expect(dishTokens(r)[0]).toBe('chicken')
    expect(dishTokens(r)).toContain('broccoli')
  })

  it('не рисует больше трёх составляющих', () => {
    for (const r of recipes) {
      expect(dishTokens(r).length, r.title).toBeLessThanOrEqual(3)
    }
  })

  it('каши и супы подаёт в миске, остальное на тарелке', () => {
    expect(isBowl(byTitle('Борщ со сметаной'))).toBe(true)
    expect(isBowl(byTitle('Овсянка на воде с яблоком'))).toBe(true)
    expect(isBowl(byTitle('Бутерброды с маслом и сыром'))).toBe(false)
    expect(isBowl(byTitle('Паста с курицей и сливками'))).toBe(false)
  })
})
