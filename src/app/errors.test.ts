import { describe, expect, it } from 'vitest'
import { describeError, errorCode, firstFrame, isChunkLoadError } from './errors'

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
    expect(describeError(dexie('OpenFailedError', 'x', dexie('InvalidStateError'))).kind).toBe('storage')
    expect(describeError(new DOMException('denied', 'SecurityError')).kind).toBe('storage')
    expect(describeError(dexie('OpenFailedError', 'x', new DOMException('denied', 'SecurityError'))).kind).toBe('storage')
  })

  /*
   * Снимок с iPhone: обычный Safari, анкета сохранена, а экран говорил
   * «Браузер не даёт хранить данные» и советовал приватное окно. На деле
   * Safari не открыл курсор — сбой запроса, записи целы.
   */
  it('сбой запроса в открытой базе — не запрет хранилища, и записи целы', () => {
    const safari = dexie('UnknownError', 'Unable to open cursor UnknownError: Unable to open cursor',
      new DOMException('Unable to open cursor', 'UnknownError'))
    const d = describeError(safari)
    expect(d.kind).toBe('storage-glitch')
    expect(d.text).not.toMatch(/приватн/)
    expect(d.text).toMatch(/на месте/)
    expect(describeError(dexie('DatabaseClosedError')).kind).toBe('storage-glitch')
    expect(describeError(dexie('InvalidStateError')).kind).toBe('storage-glitch')
    expect(describeError(dexie('OpenFailedError', 'internal error', new DOMException('x', 'UnknownError'))).kind)
      .toBe('storage-glitch')
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

describe('errorCode', () => {
  const safari = 'Qe@https://kcal-diary-koldin.netlify.app/assets/Today-Ab1_c.js:2:5610\nwe@https://kcal-diary-koldin.netlify.app/assets/index-CHwJo6iA.js:40:77'
  const chrome = 'Error: x\n    at Qe (https://kcal-diary-koldin.netlify.app/assets/Today-Ab1_c.js:2:5610)'

  it('место берётся из первой строки стека в нашем коде, в Safari и Chrome', () => {
    expect(firstFrame(safari)).toBe('Today-Ab1_c.js:2:5610')
    expect(firstFrame(chrome)).toBe('Today-Ab1_c.js:2:5610')
    expect(firstFrame('at native code')).toBeNull()
    expect(firstFrame(undefined)).toBeNull()
  })

  it('имя, сообщение без адресов, место ошибки и место в дереве', () => {
    const e = Object.assign(new Error('Attempt to use history.replaceState() more than 100 times per 10 seconds'), {
      name: 'SecurityError', stack: safari,
    })
    const code = errorCode(e, '\n    at Xe (https://kcal-diary-koldin.netlify.app/assets/Today-Ab1_c.js:3:10)')
    expect(code).toBe('SecurityError · Attempt to use history.replaceState() more than 100 times per 10 seconds · '
      + 'Today-Ab1_c.js:2:5610 · в Today-Ab1_c.js:3:10')
  })

  it('вложенную ошибку Dexie называет цепочкой, адреса вырезает, длину ограничивает', () => {
    const e = dexie('OpenFailedError', 'UnknownError Connection to Indexed Database server lost. https://tinyurl.com/abc ' + 'x'.repeat(300),
      dexie('UnknownError'))
    const code = errorCode(e)
    expect(code.startsWith('OpenFailedError ← UnknownError · UnknownError Connection to Indexed Database server lost. …')).toBe(true)
    expect(code).not.toMatch(/tinyurl|https?:/)
    expect(code.length).toBeLessThan(200)
  })

  it('не падает на том, что вообще не ошибка', () => {
    expect(errorCode(undefined)).toBe('undefined')
    expect(errorCode('сломалось')).toBe('string · сломалось')
  })
})

