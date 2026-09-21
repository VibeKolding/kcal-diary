import { describe, expect, it } from 'vitest'
import { exportedText, restoredText } from './restore'

describe('сообщения о копии', () => {
  it('склоняет итог восстановления', () => {
    expect(restoredText({ entries: 3, foods: 1, weights: 2 }))
      .toBe('3 записи, 1 продукт, 2 взвешивания')
    expect(restoredText({ entries: 0, foods: 11, weights: 25 }))
      .toBe('0 записей, 11 продуктов, 25 взвешиваний')
  })

  it('говорит, куда ушла копия, и молчит, если окно «Поделиться» закрыли', () => {
    expect(exportedText('shared')).toBe('Копия отправлена')
    expect(exportedText('downloaded')).toBe('Копия сохранена в загрузки')
    expect(exportedText('cancelled')).toBeNull()
    expect(exportedText('downloaded', 'Таблица')).toBe('Таблица сохранена в загрузки')
  })
})
