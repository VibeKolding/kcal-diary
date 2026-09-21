import { describe, expect, it } from 'vitest'
import { followSaved } from './useDraft'

describe('черновик формы и сохранённые значения', () => {
  const before = { kcal: '2000', water: '2400' }
  const after = { kcal: '1900', water: '2300' }

  it('нетронутая форма идёт за профилем: новый вес — новая норма в полях', () => {
    expect(followSaved(before, before, after)).toBe(after)
  })

  /**
   * Набрали калории, переключили тему — профиль обновился, и раньше поле
   * молча возвращалось к сохранённому значению.
   */
  it('тронутая форма не стирается чужим обновлением профиля', () => {
    const typed = { ...before, kcal: '1750' }
    expect(followSaved(typed, before, { ...before })).toBe(typed)
    expect(followSaved(typed, before, after)).toBe(typed)
  })
})
