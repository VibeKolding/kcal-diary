import { afterEach, describe, expect, it, vi } from 'vitest'
import { categoryFromTags, kindForStatus, lookupProduct, parseProduct } from './openfoodfacts'

const ok = (product: Record<string, unknown>) => ({ status: 1, product })

const yogurt = {
  product_name: 'Йогурт',
  brands: 'Молочный дом, Другой бренд',
  nutriments: { 'energy-kcal_100g': 60, proteins_100g: 5, fat_100g: 2.5, carbohydrates_100g: 4 },
  categories_tags: ['en:dairies', 'en:fermented-foods', 'en:yogurts'],
  serving_quantity: '125',
}

describe('разбор ответа Open Food Facts', () => {
  it('собирает продукт из нормального ответа', () => {
    expect(parseProduct(ok(yogurt))).toEqual({
      kind: 'found',
      product: {
        name: 'Йогурт',
        brand: 'Молочный дом',
        per100: { kcal: 60, protein: 5, fat: 2.5, carbs: 4 },
        category: 'dairy',
        servingGrams: 125,
      },
    })
  })

  it('берёт русское название, если оно есть', () => {
    const r = parseProduct(ok({ ...yogurt, product_name_ru: '  Йогурт   греческий ' }))
    expect(r.kind === 'found' && r.product.name).toBe('Йогурт греческий')
  })

  it('понимает числа строкой, в том числе с запятой', () => {
    const r = parseProduct(ok({
      ...yogurt,
      nutriments: { 'energy-kcal_100g': '120', fat_100g: '12,5', proteins_100g: 3 },
    }))
    expect(r.kind === 'found' && r.product.per100).toEqual({ kcal: 120, protein: 3, fat: 12.5, carbs: 0 })
  })

  it('без ккал считает калории из кДж', () => {
    const r = parseProduct(ok({ ...yogurt, nutriments: { energy_100g: 418.4 } }))
    expect(r.kind === 'found' && r.product.per100.kcal).toBe(100)
  })

  it('килоджоули в поле ккал не проходят, если есть настоящие кДж', () => {
    const r = parseProduct(ok({ ...yogurt, nutriments: { 'energy-kcal_100g': 1500, energy_100g: 1500 } }))
    expect(r.kind === 'found' && r.product.per100.kcal).toBe(Math.round(1500 / 4.184))
  })

  it('отклоняет NaN, отрицательные и невозможные значения', () => {
    const bad = [
      { 'energy-kcal_100g': 'abc' },
      { 'energy-kcal_100g': 4000 },
      { 'energy-kcal_100g': -5 },
      { 'energy-kcal_100g': 200, proteins_100g: -40 },
      { 'energy-kcal_100g': 200, carbohydrates_100g: 1e6 },
      { 'energy-kcal_100g': 200, fat_100g: 'n/a' },
      { 'energy-kcal_100g': 200, proteins_100g: 60, fat_100g: 30, carbohydrates_100g: 30 },
      {},
    ]
    for (const nutriments of bad) {
      expect(parseProduct(ok({ ...yogurt, nutriments })).kind).toBe('incomplete')
    }
  })

  it('без названия продукт не принимается', () => {
    expect(parseProduct(ok({ ...yogurt, product_name: '   ' })).kind).toBe('incomplete')
    expect(parseProduct(ok({ ...yogurt, product_name: 12345 })).kind).toBe('incomplete')
  })

  it('обрезает слишком длинное название и не ломается на чужих типах', () => {
    const r = parseProduct(ok({
      ...yogurt,
      product_name: 'Я'.repeat(500),
      brands: ['не строка'],
      categories_tags: 'en:yogurts',
      serving_quantity: '1e9',
    }))
    expect(r.kind).toBe('found')
    if (r.kind !== 'found') return
    expect([...r.product.name]).toHaveLength(120)
    expect(r.product.brand).toBeUndefined()
    expect(r.product.category).toBe('other')
    expect(r.product.servingGrams).toBeUndefined()
  })

  it('status 0 — кода нет, прочий мусор — сломанный ответ', () => {
    expect(parseProduct({ status: 0 }).kind).toBe('missing')
    expect(parseProduct(null).kind).toBe('broken')
    expect(parseProduct('<html>').kind).toBe('broken')
    expect(parseProduct({ status: 1 }).kind).toBe('broken')
  })
})

describe('код ответа', () => {
  it('различает «нет в базе» и «база недоступна»', () => {
    expect(kindForStatus(200)).toBeNull()
    expect(kindForStatus(404)).toBe('missing')
    expect(kindForStatus(429)).toBe('unavailable')
    expect(kindForStatus(503)).toBe('unavailable')
  })
})

describe('категория по тегам', () => {
  const plant = ['en:plant-based-foods-and-beverages', 'en:plant-based-foods']

  it('растительные продукты больше не становятся напитками', () => {
    expect(categoryFromTags([...plant, 'en:cereals-and-potatoes', 'en:breads'])).toBe('bread')
    expect(categoryFromTags([...plant, 'en:cereals-and-potatoes', 'en:cereal-grains', 'en:buckwheat'])).toBe('grain')
    expect(categoryFromTags([...plant, 'en:cereals-and-potatoes', 'en:pastas'])).toBe('grain')
    expect(categoryFromTags([...plant, 'en:fats', 'en:vegetable-fats', 'en:vegetable-oils', 'en:sunflower-oils'])).toBe('oil')
    expect(categoryFromTags([...plant, 'en:fruits-and-vegetables-based-foods', 'en:fruits', 'en:apples'])).toBe('fruit')
    expect(categoryFromTags(plant)).toBe('other')
  })

  it('настоящие напитки остаются напитками', () => {
    expect(categoryFromTags([...plant, 'en:beverages', 'en:fruit-based-beverages', 'en:juices-and-nectars', 'en:fruit-juices'])).toBe('drink')
    expect(categoryFromTags(['en:beverages', 'en:waters', 'en:mineral-waters'])).toBe('drink')
  })

  it('смысл тега — его последнее слово', () => {
    expect(categoryFromTags(['en:snacks', 'en:sweet-snacks', 'en:chocolates', 'en:milk-chocolates'])).toBe('sweet')
    expect(categoryFromTags(['en:farming-products', 'en:eggs', 'en:chicken-eggs'])).toBe('egg')
    // «champagnes» содержит «ham», но ветчиной от этого не становится
    expect(categoryFromTags(['en:beverages', 'en:alcoholic-beverages', 'en:wines', 'en:champagnes'])).toBe('drink')
  })

  it('незнакомые теги дают «другое»', () => {
    expect(categoryFromTags(['ru:пельмени'])).toBe('other')
    expect(categoryFromTags([])).toBe('other')
  })
})

describe('запрос в базу', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const respond = (status: number, body: string) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))

  it('находит продукт', async () => {
    respond(200, JSON.stringify(ok(yogurt)))
    expect((await lookupProduct('4006381333931')).kind).toBe('found')
  })

  it('404 — нет в базе, 429 и 5xx — база недоступна', async () => {
    respond(404, JSON.stringify({ status: 0 }))
    expect((await lookupProduct('4006381333931')).kind).toBe('missing')
    respond(429, 'Too Many Requests')
    expect((await lookupProduct('4006381333931')).kind).toBe('unavailable')
    respond(502, '<html>Bad Gateway</html>')
    expect((await lookupProduct('4006381333931')).kind).toBe('unavailable')
  })

  it('сломанный ответ не выдаётся за пропавшую сеть', async () => {
    respond(200, '<html>captive portal</html>')
    expect((await lookupProduct('4006381333931')).kind).toBe('broken')
  })

  it('сбой сети — это «нет сети»', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect((await lookupProduct('4006381333931')).kind).toBe('offline')
  })

  /** fetch, который отвечает только отменой — как зависшая сеть */
  const hang = () => vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))

  it('зависший запрос обрывается по тайм-ауту', async () => {
    hang()
    expect((await lookupProduct('4006381333931', undefined, 20)).kind).toBe('timeout')
  })

  it('отмена снаружи — исключение, а не результат', async () => {
    hang()
    const ctrl = new AbortController()
    const pending = lookupProduct('4006381333931', ctrl.signal, 5000)
    ctrl.abort()
    await expect(pending).rejects.toThrow()
  })
})
