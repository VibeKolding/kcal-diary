import { describe, expect, it } from 'vitest'
import { cleanGrams, gramsDraft, gramsError, parseGrams } from './grams'

describe('поле граммов', () => {
  it('стёртое поле пустое, и набор 250 даёт 250, а не 1250', () => {
    // Раньше Number('') || 0 и Math.max(1, …) оставляли в поле «1»
    let draft = cleanGrams('')
    expect(draft).toBe('')
    expect(parseGrams(draft)).toBeNull()
    for (const ch of '250') draft = cleanGrams(draft + ch)
    expect(parseGrams(draft)).toBe(250)
  })

  it('понимает запятую и точку', () => {
    expect(parseGrams('12,5')).toBe(12.5)
    expect(parseGrams('12.5')).toBe(12.5)
    expect(cleanGrams('1,2,3')).toBe('1.23')
  })

  it('держит порцию в пределах 1…3000 г', () => {
    expect(parseGrams('0')).toBeNull()
    expect(parseGrams('0,5')).toBeNull()
    expect(parseGrams('1')).toBe(1)
    expect(parseGrams('3000')).toBe(3000)
    expect(parseGrams('3001')).toBeNull()
    expect(parseGrams('99999')).toBeNull()
  })

  it('мусор не превращается в число', () => {
    expect(parseGrams('абв')).toBeNull()
    expect(parseGrams('.')).toBeNull()
  })

  it('пустое поле — не ошибка, а число вне пределов — ошибка', () => {
    expect(gramsError('')).toBeNull()
    expect(gramsError('250')).toBeNull()
    expect(gramsError('5000')).toMatch(/3000/)
    expect(gramsError('0')).toMatch(/От 1/)
  })

  it('граммы записи показываются без хвоста', () => {
    expect(gramsDraft(150)).toBe('150')
    expect(gramsDraft(12.5)).toBe('12.5')
    expect(gramsDraft(0.1 + 0.2)).toBe('0.3')
  })
})
