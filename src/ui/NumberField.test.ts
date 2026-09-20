import { describe, expect, it } from 'vitest'
import { cleanNumberInput, parseNumber } from './NumberField'

describe('cleanNumberInput', () => {
  it('пропускает обычные числа', () => {
    expect(cleanNumberInput('175')).toBe('175')
  })

  it('сохраняет пустую строку — поле обязано уметь быть пустым', () => {
    expect(cleanNumberInput('')).toBe('')
  })

  it('выбрасывает буквы и пробелы', () => {
    expect(cleanNumberInput('17 5см')).toBe('175')
  })

  it('в целочисленном поле убирает точку', () => {
    expect(cleanNumberInput('175.5')).toBe('1755')
  })

  it('в дробном поле оставляет точку', () => {
    expect(cleanNumberInput('80.5', true)).toBe('80.5')
  })

  it('приводит запятую к точке', () => {
    expect(cleanNumberInput('80,5', true)).toBe('80.5')
  })

  it('оставляет только один разделитель', () => {
    expect(cleanNumberInput('80.5.7', true)).toBe('80.57')
  })

  it('терпит промежуточные состояния набора', () => {
    for (const step of ['8', '80', '80.', '80.5']) {
      expect(cleanNumberInput(step, true)).toBe(step)
    }
  })
})

describe('parseNumber', () => {
  it('пустое поле даёт null, а не ноль', () => {
    // Именно из-за приведения пустой строки к нулю поле нельзя было очистить
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('   ')).toBeNull()
  })

  it('разбирает целые и дробные', () => {
    expect(parseNumber('175')).toBe(175)
    expect(parseNumber('80.5')).toBe(80.5)
  })

  it('незавершённый ввод «80.» считает числом 80', () => {
    expect(parseNumber('80.')).toBe(80)
  })

  it('мусор даёт null', () => {
    expect(parseNumber('.')).toBeNull()
  })
})
