import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CatalogRecipe } from './catalog'

interface RawFood { id: string; n: string; k: number; p: number; f: number; u: number }

const foods = new Map<string, RawFood>(
  (JSON.parse(readFileSync('public/data/foods.json', 'utf8')) as { items: RawFood[] })
    .items.map((f) => [f.n, f]),
)
const recipes = (JSON.parse(readFileSync('public/data/recipes.json', 'utf8')) as {
  items: CatalogRecipe[]
}).items

describe('каталог рецептов', () => {
  it('не пустой и покрывает все цели и приёмы пищи', () => {
    expect(recipes.length).toBeGreaterThan(0)
    for (const goal of ['lose', 'keep', 'gain'] as const) {
      for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
        const found = recipes.filter((r) => r.goal === goal && r.meal === meal)
        expect(found.length, `${goal}/${meal}`).toBeGreaterThan(0)
      }
    }
  })

  it('ссылается только на существующие продукты', () => {
    for (const r of recipes) {
      for (const item of r.items) {
        expect(foods.has(item.n), `${r.title}: нет продукта «${item.n}»`).toBe(true)
      }
    }
  })

  /**
   * Главная проверка: БЖУ рецепта должны сходиться с суммой его ингред:
   * если поправить продукт в базе и забыть пересобрать каталог,
   * рецепт начнёт врать, и заметить это глазами невозможно.
   */
  it('БЖУ сходятся с составом', () => {
    for (const r of recipes) {
      let kcal = 0, protein = 0, fat = 0, carbs = 0
      for (const item of r.items) {
        const f = foods.get(item.n)!
        const k = item.g / 100
        kcal += f.k * k; protein += f.p * k; fat += f.f * k; carbs += f.u * k
      }
      const scale = 100 / r.yieldGrams
      expect(r.per100.kcal, r.title).toBeCloseTo(kcal * scale, 0)
      expect(r.per100.protein, r.title).toBeCloseTo(protein * scale, 1)
      expect(r.per100.fat, r.title).toBeCloseTo(fat * scale, 1)
      expect(r.per100.carbs, r.title).toBeCloseTo(carbs * scale, 1)
    }
  })

  it('вес готового правдоподобен относительно сырого', () => {
    for (const r of recipes) {
      // Мясо ужаривается и теряет до половины веса, а сухая крупа и макароны,
      // наоборот, набирают воду и тяжелеют втрое. Поэтому строгого неравенства
      // здесь быть не может — проверяем только, что цифра не абсурдна
      // (например, 39 г вместо 390 из-за опечатки).
      const k = r.yieldGrams / r.rawGrams
      expect(k, `${r.title}: выход ${r.yieldGrams} г при ${r.rawGrams} г сырых`)
        .toBeGreaterThan(0.4)
      expect(k, `${r.title}: выход ${r.yieldGrams} г при ${r.rawGrams} г сырых`)
        .toBeLessThan(2.6)
    }
  })

  it('калорийность порции соответствует цели', () => {
    const range: Record<CatalogRecipe['goal'], { min: number; max: number }> = {
      lose: { min: 150, max: 500 },
      keep: { min: 400, max: 620 },
      gain: { min: 600, max: 1100 },
    }
    for (const r of recipes) {
      const kcal = (r.per100.kcal * r.yieldGrams) / 100 / r.portions
      const { min, max } = range[r.goal]
      expect(kcal, `${r.title} (${r.goal})`).toBeGreaterThanOrEqual(min)
      expect(kcal, `${r.title} (${r.goal})`).toBeLessThanOrEqual(max)
    }
  })

  it('тексты без посторонних символов', () => {
    // Опечатка вроде случайного иероглифа в шаге незаметна при беглом чтении,
    // но видна пользователю
    const allowed = /^[\u0400-\u04FFA-Za-z0-9 ,.\-—–:;!?()«»%°/'’+\n]+$/
    for (const r of recipes) {
      for (const text of [r.title, r.tip, ...r.steps]) {
        expect(allowed.test(text), `${r.title}: «${text}»`).toBe(true)
      }
    }
  })

  it('названия рецептов не повторяются', () => {
    const titles = recipes.map((r) => r.title)
    expect(new Set(titles).size, 'есть дубликаты названий').toBe(titles.length)
  })

  it('в каждой паре «цель + приём пищи» одинаковое число рецептов', () => {
    const counts = new Set<number>()
    for (const goal of ['lose', 'keep', 'gain'] as const) {
      for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
        counts.add(recipes.filter((r) => r.goal === goal && r.meal === meal).length)
      }
    }
    expect(counts.size, `разное количество: ${[...counts].join(', ')}`).toBe(1)
  })

  /**
   * CC BY и CC BY-SA требуют указания автора. Фото без подписи —
   * это нарушение лицензии, а не просто недостающий текст.
   */
  it('каждое фото существует на диске', () => {
    for (const r of recipes) {
      if (!r.photo) continue
      expect(r.photo.src, r.title).toMatch(/^\/images\/recipes\/.+\.webp$/)
      // Битая ссылка на картинку иначе всплывёт только на экране
      expect(existsSync(`public${r.photo.src}`), `нет файла ${r.photo.src}`).toBe(true)
    }
  })

  /**
   * Сейчас фотографий нет — все обложки рисованные. Проверка остаётся
   * рабочей на случай, когда снимки появятся: у чужого фото обязана быть
   * подпись с автором, этого требуют лицензии CC BY и CC BY-SA.
   */
  it('у чужого фото есть подпись с автором', () => {
    for (const r of recipes) {
      if (!r.photo?.source) continue
      expect(r.photo.credit.length, `${r.title}: нет подписи`).toBeGreaterThan(3)
    }
  })

  it('все обложки в каталоге одного вида', () => {
    const withPhoto = recipes.filter((r) => r.photo).length
    expect(withPhoto === 0 || withPhoto === recipes.length,
      `фото у ${withPhoto} из ${recipes.length} — каталог выглядел бы лоскутным`).toBe(true)
  })

  /**
   * В каталоге не должно быть свинины: ни в составе, ни в названии,
   * ни в шагах приготовления. Проверяется отдельно, потому что новый
   * рецепт легко добавить и не вспомнить про это ограничение.
   */
  it('нигде нет свинины', () => {
    const pork = /свинин|бекон|шпик|сало\b|сосиск|колбас|карбонад|грудинк|окорок|карбонара/i
    for (const r of recipes) {
      for (const item of r.items) {
        expect(pork.test(item.n), `${r.title}: продукт «${item.n}»`).toBe(false)
      }
      const text = [r.title, r.tip, ...r.steps].join(' ')
      const found = text.match(pork)
      expect(found, `${r.title}: в тексте «${found?.[0]}»`).toBeNull()
      // Ветчина допустима только куриная
      for (const item of r.items) {
        if (/ветчин/i.test(item.n)) {
          expect(item.n, r.title).toBe('Ветчина куриная')
        }
      }
    }
  })

  it('у каждого рецепта есть шаги и подсказка', () => {
    for (const r of recipes) {
      expect(r.steps.length, r.title).toBeGreaterThanOrEqual(3)
      expect(r.tip.length, r.title).toBeGreaterThan(10)
      expect(r.minutes, r.title).toBeGreaterThan(0)
    }
  })
})
