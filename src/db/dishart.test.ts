import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TOKEN_BY_PRODUCT, dishTokens, isBowl, tokenFor, type CatalogRecipe } from './catalog'

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

  /*
   * Ловушки порядка правил: в названии продукта может прятаться слово из
   * чужого правила. «Яйцо куриное варёное» содержит «куриное», «Печенье
   * овсяное» — «печень», «Сельдерей стеблевой» — «сельд». Пока порядок был
   * другим, тринадцать обложек рисовали куриную ножку вместо яйца.
   */
  it('не путает продукт с чужим правилом по куску слова', () => {
    expect(tokenFor('Яйцо куриное варёное')).toBe('egg')
    expect(tokenFor('Печенье овсяное')).toBe('grain')
    expect(tokenFor('Сельдерей стеблевой')).toBe('greens')
    // и обратная сторона: настоящая курица и настоящая печень не потерялись
    expect(tokenFor('Куриная грудка сырая')).toBe('chicken')
    expect(tokenFor('Печень куриная тушёная')).toBe('chicken')
    expect(tokenFor('Сельдь солёная')).toBe('fish')
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

/*
 * Ловушки порядка правил.
 *
 * Побеждает первое подошедшее правило, а название продукта может содержать
 * слово из чужого: «Яйцо куриное варёное» — «куриное», «Печенье овсяное» —
 * «печень», «Сельдерей стеблевой» — «сельд». Первая из них дожила до
 * приложения и рисовала куриную ножку на тринадцати обложках из
 * шестидесяти трёх.
 *
 * Тест идёт по всем названиям из базы продуктов и из рецептов и собирает
 * те, на которые подходит больше одного правила. Список известных и
 * безобидных записан здесь целиком: новое совпадение уронит тест с именем
 * продукта, и его нужно будет либо признать безобидным, либо развести
 * правила.
 */
describe('правила узнавания продуктов', () => {
  const KNOWN_AMBIGUOUS = [
    'Ветчина куриная',        // курица вперёд мяса — это и есть курица
    'Гречка с курицей',       // блюдо, курица главнее крупы
    'Котлета куриная',
    'Печень куриная тушёная',
    'Салат Цезарь с курицей',
    'Сгущённое молоко',       // молочное вперёд сладкого
    'Творожный сыр',          // творожное вперёд сыра
    'Яйцо куриное варёное',   // яйцо вперёд курицы — ради него всё и затевалось
  ]

  const foods = (JSON.parse(readFileSync('public/data/foods.json', 'utf8')) as {
    items: { n: string }[]
  }).items

  it('на продукт не подходит несколько правил сразу', () => {
    const names = new Set<string>([
      ...foods.map((f) => f.n),
      ...recipes.flatMap((r) => r.items.map((i) => i.n)),
    ])
    const ambiguous = [...names]
      .filter((n) => TOKEN_BY_PRODUCT.filter(([re]) => re.test(n)).length > 1)
      .sort()
    expect(ambiguous).toEqual([...KNOWN_AMBIGUOUS].sort())
  })
})
