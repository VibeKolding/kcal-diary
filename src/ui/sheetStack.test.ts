import { describe, expect, it } from 'vitest'
import { createSheetStack, lockPage } from './sheetStack'

/** body и #root без DOM: тесты идут в node */
function fakePage() {
  const body = { style: { overflow: '' } }
  const attrs = new Set<string>()
  const root = {
    hasAttribute: (n: string) => attrs.has(n),
    setAttribute: (n: string) => { attrs.add(n) },
    removeAttribute: (n: string) => { attrs.delete(n) },
  }
  return { body, root, inert: () => attrs.has('inert') }
}

function setup() {
  const page = fakePage()
  const counts: number[] = []
  const stack = createSheetStack<string>({
    lock: () => lockPage(page.body, page.root),
    onCount: (n) => counts.push(n),
  })
  return { page, stack, counts }
}

describe('блокировка страницы под панелями', () => {
  it('одна панель: блокирует и отпускает', () => {
    const { page, stack } = setup()
    stack.open('a')
    expect(page.body.style.overflow).toBe('hidden')
    expect(page.inert()).toBe(true)
    stack.close('a')
    expect(page.body.style.overflow).toBe('')
    expect(page.inert()).toBe(false)
  })

  // Регрессия: «Добавить еду» → «Сколько съели» → «Добавить в дневник»
  // оставляли body с overflow:hidden, и не прокручивался ни один экран
  it('смена панелей в любом порядке не оставляет страницу заблокированной', () => {
    const orders: [string, string][][] = [
      // Порция открылась раньше, чем ушла панель добавления
      [['open', 'add'], ['open', 'portion'], ['close', 'add'], ['close', 'portion']],
      // Панель добавления ушла раньше, чем открылась порция
      [['open', 'add'], ['close', 'add'], ['open', 'portion'], ['close', 'portion']],
      // Родитель размонтирован: очистки пришли в обратном порядке
      [['open', 'add'], ['open', 'portion'], ['close', 'portion'], ['close', 'add']],
    ]
    for (const steps of orders) {
      const { page, stack } = setup()
      for (const [op, name] of steps.slice(0, -1)) {
        if (op === 'open') stack.open(name)
        else stack.close(name)
        // Пока хоть одна панель открыта, страница заблокирована
        expect(page.body.style.overflow).toBe(stack.items().length > 0 ? 'hidden' : '')
      }
      const [, lastName] = steps[steps.length - 1]!
      stack.close(lastName)
      expect(page.body.style.overflow).toBe('')
      expect(page.inert()).toBe(false)
    }
  })

  it('повторное закрытие и повторное открытие ничего не ломают', () => {
    const { page, stack, counts } = setup()
    stack.open('a')
    stack.open('a')
    stack.close('a')
    stack.close('a')
    expect(page.body.style.overflow).toBe('')
    expect(counts).toEqual([1, 0])
  })

  it('возвращает тот overflow, что был до первой панели', () => {
    const { page, stack } = setup()
    page.body.style.overflow = 'clip'
    stack.open('a')
    stack.open('b')
    stack.close('a')
    stack.close('b')
    expect(page.body.style.overflow).toBe('clip')
  })

  it('верхняя панель — последняя открытая', () => {
    const { stack } = setup()
    stack.open('a')
    stack.open('b')
    expect(stack.top()).toBe('b')
    stack.close('b')
    expect(stack.top()).toBe('a')
  })
})
