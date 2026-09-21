import { describe, expect, it } from 'vitest'
import { saveMethod, shareFailure } from './share'

describe('как отдать копию', () => {
  it('на телефоне — листом «Поделиться», если браузер умеет отдать файл', () => {
    expect(saveMethod({ coarsePointer: true, canShareFile: true })).toBe('share')
  })

  it('на компьютере и там, где файлом не поделиться, — загрузкой', () => {
    expect(saveMethod({ coarsePointer: false, canShareFile: true })).toBe('download')
    expect(saveMethod({ coarsePointer: true, canShareFile: false })).toBe('download')
  })

  /* Закрытый лист — не копия: отметку ставить нельзя, напоминание должно остаться */
  it('закрытый лист считает отменой, а сбой — поводом скачать', () => {
    expect(shareFailure(new DOMException('отменено', 'AbortError'))).toBe('cancelled')
    expect(shareFailure(new DOMException('нет жеста', 'NotAllowedError'))).toBe('fallback')
    expect(shareFailure(new TypeError('files'))).toBe('fallback')
    expect(shareFailure(null)).toBe('fallback')
  })
})
