import { describe, expect, it } from 'vitest'
import { describeError, isChunkLoadError } from './errors'

/** Ошибка Dexie: обычный Error с именем и, бывает, исходной ошибкой в inner */
function dexie(name: string, msg = 'x', inner?: unknown): Error {
  return Object.assign(new Error(msg), { name, inner })
}

describe('isChunkLoadError', () => {
  it('узнаёт отказ ленивого чанка в Chrome, Firefox и Safari', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Stats-1.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/assets/Gym-2.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
  })

  it('узнаёт отказ подгрузки стилей чанка', () => {
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/Stats-1.css'))).toBe(true)
  })

  it('обычную ошибку отрисовки чанком не считает', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'kcal')"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('describeError', () => {
  it('не показывает человеку английский текст Dexie со ссылкой', () => {
    const d = describeError(dexie('MissingAPIError', 'IndexedDB API missing. Please visit https://tinyurl.com/y2uuvskb'))
    expect(d.kind).toBe('storage')
    expect(d.text).not.toMatch(/tinyurl|IndexedDB/)
    expect(d.text).toMatch(/приватном/)
  })

  it('отказ браузера в приватном окне — это тоже хранилище', () => {
    expect(describeError(dexie('InvalidStateError')).kind).toBe('storage')
    expect(describeError(new DOMException('denied', 'SecurityError')).kind).toBe('storage')
  })

  it('смотрит внутрь OpenFailedError: нехватка места — отдельный совет', () => {
    const inner = new DOMException('quota', 'QuotaExceededError')
    expect(describeError(dexie('OpenFailedError', 'x', inner)).kind).toBe('quota')
    expect(describeError(dexie('OpenFailedError', 'x', dexie('VersionError'))).kind).toBe('version')
    expect(describeError(dexie('OpenFailedError')).kind).toBe('storage')
  })

  it('сетевой сбой называет сетевым', () => {
    expect(describeError(new TypeError('Failed to fetch')).kind).toBe('network')
    expect(describeError(new TypeError('Load failed')).kind).toBe('network')
  })

  it('отказ чанка важнее сети: у него свой совет', () => {
    expect(describeError(new TypeError('Failed to fetch dynamically imported module: /a.js')).kind).toBe('chunk')
  })

  it('свою русскую ошибку показывает как есть', () => {
    const d = describeError(new Error('Не удалось загрузить базу продуктов: 404'))
    expect(d.text).toBe('Не удалось загрузить базу продуктов: 404')
  })

  it('чужую английскую ошибку заменяет общим русским текстом', () => {
    const d = describeError(new TypeError("Cannot read properties of undefined (reading 'kcal')"))
    expect(d.kind).toBe('other')
    expect(d.text).not.toMatch(/Cannot read/)
    expect(d.text).toMatch(/[а-яё]/i)
  })

  it('переживает то, что вообще не ошибка', () => {
    expect(describeError(undefined).kind).toBe('other')
    expect(describeError('сломалось').text).toBe('сломалось')
  })
})
