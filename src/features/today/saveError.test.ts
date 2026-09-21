import { describe, expect, it } from 'vitest'
import { saveErrorText } from './saveError'

function named(name: string, inner?: unknown): Error {
  const e = new Error('сбой') as Error & { inner?: unknown }
  e.name = name
  if (inner !== undefined) e.inner = inner
  return e
}

describe('текст ошибки записи', () => {
  it('нехватку места называет прямо', () => {
    expect(saveErrorText(named('QuotaExceededError'))).toMatch(/не хватает места/)
  })

  it('находит нехватку места внутри обёртки Dexie', () => {
    expect(saveErrorText(named('AbortError', named('QuotaExceededError')))).toMatch(/не хватает места/)
  })

  it('на прочие сбои предлагает попробовать ещё раз', () => {
    expect(saveErrorText(named('InvalidStateError'))).toMatch(/Попробуйте ещё раз/)
    expect(saveErrorText('строка вместо ошибки')).toMatch(/Попробуйте ещё раз/)
    expect(saveErrorText(undefined)).toMatch(/Попробуйте ещё раз/)
  })
})
