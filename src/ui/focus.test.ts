import { describe, expect, it } from 'vitest'
import { tabStep } from './focus'

describe('Tab внутри панели', () => {
  const list = ['first', 'middle', 'last']

  it('Shift+Tab сразу после открытия ведёт на последнюю кнопку, а не на body', () => {
    // Фокус стоит на самом контейнере панели, а не на ком-то внутри
    expect(tabStep(list, null, false, true)).toBe('last')
  })

  it('Tab сразу после открытия ведёт на первую кнопку', () => {
    expect(tabStep(list, null, false, false)).toBe('first')
  })

  it('с последней по Tab — на первую, с первой по Shift+Tab — на последнюю', () => {
    expect(tabStep(list, 'last', true, false)).toBe('first')
    expect(tabStep(list, 'first', true, true)).toBe('last')
  })

  it('в середине списка шаг делает браузер', () => {
    expect(tabStep(list, 'middle', true, false)).toBeNull()
    expect(tabStep(list, 'middle', true, true)).toBeNull()
  })

  it('пустая панель — шагать некуда', () => {
    expect(tabStep([], null, false, false)).toBeNull()
  })
})
