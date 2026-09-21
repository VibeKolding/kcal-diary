import { describe, expect, it } from 'vitest'
import { ringStep, tabStep } from './focus'

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

describe('Tab по кругу вместе с тостом', () => {
  // «Отменить» тоста лежит вне панели и встаёт в круг последним
  const list = ['first', 'last', 'toast']

  it('с последней кнопки панели Tab ведёт на «Отменить», а оттуда — на первую', () => {
    expect(ringStep(list, 'last', false)).toBe('toast')
    expect(ringStep(list, 'toast', false)).toBe('first')
  })

  it('Shift+Tab с «Отменить» возвращает в панель, с первой — на «Отменить»', () => {
    expect(ringStep(list, 'toast', true)).toBe('last')
    expect(ringStep(list, 'first', true)).toBe('toast')
  })

  it('фокуса в круге нет — решает обычный шаг', () => {
    expect(ringStep(list, null, false)).toBeNull()
    expect(ringStep(list, 'elsewhere', true)).toBeNull()
  })
})
