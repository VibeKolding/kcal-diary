import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from './db'
import { invalidateIndex, rankByWords, searchFoods, searchText } from './foods'
import type { Food } from '@/domain/types'

function food(id: string, name: string, category: Food['category'] = 'other'): Food {
  return {
    id, name, per100: { kcal: 100, protein: 1, fat: 1, carbs: 1 },
    servings: [], category, source: 'builtin', usageCount: 0, lastUsedAt: 0,
  }
}

describe('поиск продуктов', () => {
  beforeAll(async () => {
    await db.foods.clear()
    await db.foods.bulkPut([
      food('1', 'Мёд', 'sweet'),
      food('2', 'Мармелад', 'sweet'),
      food('3', 'Сметана 15%', 'dairy'),
      food('4', 'Гречка варёная', 'grain'),
      food('5', 'Рис белый варёный', 'grain'),
      food('6', 'Квашеная капуста', 'vegetable'),
      food('7', 'Каша гречневая на молоке', 'dish'),
      food('8', 'Свёкла отварная', 'vegetable'),
    ])
    invalidateIndex()
  })

  it('не различает «ё» и «е»', async () => {
    expect(searchText('Мёд')).toBe('мед')
    expect((await searchFoods('мед'))[0]?.name).toBe('Мёд')
    expect((await searchFoods('свекла'))[0]?.name).toBe('Свёкла отварная')
  })

  it('не зависит от порядка слов', async () => {
    expect((await searchFoods('вареная гречка'))[0]?.name).toBe('Гречка варёная')
    expect((await searchFoods('гречка варёная'))[0]?.name).toBe('Гречка варёная')
    expect((await searchFoods('гречневая каша'))[0]?.name).toBe('Каша гречневая на молоке')
  })
})

describe('rankByWords', () => {
  it('сначала те, где нашлись все слова, среди них выше точные', () => {
    const got = rankByWords(
      [
        [{ item: 'a', score: 0.1 }, { item: 'b', score: 0.3 }, { item: 'c', score: 0 }],
        [{ item: 'b', score: 0 }, { item: 'a', score: 0.3 }],
      ],
      (s) => s, 10,
    )
    expect(got).toEqual(['b', 'a', 'c'])
  })

  it('частичные совпадения не теряются, а идут ниже', () => {
    expect(rankByWords([[{ item: 'a', score: 0.2 }], []], (s) => s, 10)).toEqual(['a'])
  })
})
