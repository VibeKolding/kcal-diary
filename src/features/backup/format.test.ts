import { describe, expect, it } from 'vitest'
import { BackupError, isDayKey, isEmptyDiary, parseBackup, type Backup } from './format'

const profile = {
  id: 1, sex: 'female', birthDate: '1990-05-17', heightCm: 165,
  activity: 'light', goal: 'lose', ratePerWeek: 0.5,
  targets: { kcal: 1800, protein: 120, fat: 55, carbs: 190 },
  targetsManual: false, theme: 'light', waterGoalMl: 2000, createdAt: 1_700_000_000_000,
}

const entry = {
  id: 'e_1', date: '2026-09-20', meal: 'lunch', title: 'Гречка', category: 'grain',
  grams: 200, per100: { kcal: 110, protein: 4.2, fat: 1.1, carbs: 21.3 },
  refId: 'b1', refType: 'food', createdAt: 1_700_000_000_000,
}

function backup(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 'kcal-diary-backup', version: 1, exportedAt: '2026-09-20T10:00:00.000Z',
    profile: [profile], foods: [], recipes: [], entries: [entry], weights: [], water: [],
    ...over,
  }
}

/** Файл проходит через JSON, как настоящий: так в нём могут быть «__proto__» и 1e400 */
function viaJson(text: string): unknown {
  return JSON.parse(text)
}

describe('проверка копии', () => {
  it('принимает правильную копию', () => {
    const b = parseBackup(backup())
    expect(b.profile[0]).toEqual(profile)
    expect(b.entries[0]).toEqual(entry)
    expect(b.notes).toEqual([])
  })

  /*
   * Каждая из этих копий раньше проходила проверку и превращала главный
   * экран в белый — навсегда, до очистки данных сайта.
   */
  it.each([
    ['профиль без нормы', { profile: [{ id: 1, sex: 'male' }] }, /запись № 1 в разделе «Профиль»/],
    ['запись без состава', { entries: [{ ...entry, per100: undefined }] }, /per100/],
    ['состав null', { entries: [{ ...entry, per100: null }] }, /per100/],
    ['приём «brunch»', { entries: [{ ...entry, meal: 'brunch' }] }, /meal.*brunch/],
    ['вес строкой', { entries: [{ ...entry, grams: '100' }] }, /grams/],
    ['отрицательный вес', { entries: [{ ...entry, grams: -1e308 }] }, /grams/],
    ['дата не дата', { entries: [{ ...entry, date: 'не-дата' }] }, /date/],
    ['30 февраля', { entries: [{ ...entry, date: '2026-02-30' }] }, /date/],
    ['запись без id', { entries: [{ ...entry, id: undefined }] }, /id/],
    ['белок строкой', { entries: [{ ...entry, per100: { ...entry.per100, protein: 'много' } }] }, /per100\.protein/],
    ['вес тела текстом', { weights: [{ date: '2026-09-20', kg: 'сто' }] }, /Вес.*kg/],
    ['категория «constructor»', { entries: [{ ...entry, category: 'constructor' }] }, /category/],
    ['запись — не объект', { entries: [42] }, /Записи дневника/],
    ['профиль с чужим id', { profile: [{ ...profile, id: 2 }] }, /id/],
    ['пустой профиль', { profile: [] }, /нет профиля/],
    ['необязательный раздел не списком', { notes: 'сломано' }, /notes/],
  ])('отклоняет: %s', (_, over, message) => {
    expect(() => parseBackup(backup(over))).toThrow(BackupError)
    expect(() => parseBackup(backup(over))).toThrow(message)
  })

  it('называет раздел и номер записи', () => {
    const bad = backup({ entries: [entry, { ...entry, id: 'e_2', meal: 'brunch' }] })
    expect(() => parseBackup(bad)).toThrow(
      'В копии повреждена запись № 2 в разделе «Записи дневника»: поле «meal» — неизвестное значение "brunch". Дневник не тронут.',
    )
  })

  it('не пропускает бесконечность из JSON', () => {
    const text = JSON.stringify(backup()).replace('"grams":200', '"grams":1e400')
    expect(() => parseBackup(viaJson(text))).toThrow(/grams/)
  })

  it('собирает записи заново: лишние поля и «__proto__» в базу не попадают', () => {
    const text = JSON.stringify(backup({
      entries: [{ ...entry, extra: 'мусор', constructor: 'x' }],
    })).replace('"id":"e_1"', '"__proto__":{"polluted":true},"id":"e_1"')
    const b = parseBackup(viaJson(text))
    const e = b.entries[0]!
    expect(Object.keys(e).sort()).toEqual(Object.keys(entry).sort())
    expect(Object.getPrototypeOf(e)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('схлопывает повторяющиеся id, как это сделала бы база', () => {
    const b = parseBackup(backup({ entries: [entry, entry, { ...entry, grams: 300 }] }))
    expect(b.entries).toHaveLength(1)
    expect(b.entries[0]!.grams).toBe(300)
  })

  it('терпит отсутствие необязательных разделов и полей', () => {
    const noOptional = { ...entry }
    delete (noOptional as Partial<typeof entry>).refId
    delete (noOptional as Partial<typeof entry>).refType
    const b = parseBackup(backup({ entries: [{ ...noOptional, noMacros: true }] }))
    expect(b.entries[0]).toEqual({ ...noOptional, noMacros: true })
    expect(b.activity).toEqual([])
  })

  it('проверяет обёртку раньше записей', () => {
    expect(() => parseBackup(null)).toThrow(/не похож/)
    expect(() => parseBackup({ format: 'other' })).toThrow(/не от этого приложения/)
    expect(() => parseBackup(backup({ version: 99 }))).toThrow(/более новой версией/)
    expect(() => parseBackup(backup({ version: '1' }))).toThrow(/версии/)
    expect(() => parseBackup(backup({ entries: 'сломано' }))).toThrow(/entries/)
  })
})

describe('isDayKey', () => {
  it('отличает настоящую дату от похожей строки', () => {
    expect(isDayKey('2028-02-29')).toBe(true)
    expect(isDayKey('2026-02-29')).toBe(false)
    expect(isDayKey('2026-13-01')).toBe(false)
    expect(isDayKey('2026-9-1')).toBe(false)
    expect(isDayKey(20260901)).toBe(false)
  })
})

describe('isEmptyDiary', () => {
  const empty: Backup = {
    format: 'kcal-diary-backup', version: 1, exportedAt: '',
    profile: [], foods: [], recipes: [], entries: [], weights: [], water: [],
  }

  it('анкета со стартовым весом — это ещё пустой дневник', () => {
    const b = parseBackup(backup({ entries: [] }))
    expect(isEmptyDiary({ ...b, weights: [{ date: '2026-09-20', kg: 70 }] })).toBe(true)
    expect(isEmptyDiary(empty)).toBe(true)
  })

  it('записи, свои продукты или история веса — уже нет', () => {
    const b = parseBackup(backup())
    expect(isEmptyDiary(b)).toBe(false)
    expect(isEmptyDiary({
      ...empty,
      weights: [{ date: '2026-09-19', kg: 70 }, { date: '2026-09-20', kg: 69.8 }],
    })).toBe(false)
    expect(isEmptyDiary({ ...empty, notes: [{ date: '2026-09-20', text: 'болел' }] })).toBe(false)
  })
})
