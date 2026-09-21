import { describe, expect, it } from 'vitest'
import { calcTargets, ageFrom, splitMacros } from '@/domain/targets'
import {
  birthDateAfterEdit, checkNormForm, macrosOverKcal, normFormFrom, type NormValues,
} from './norm'

const NOW = new Date('2026-09-21T12:00:00')

describe('норма под ручную калорийность', () => {
  const body = { weightKg: 80, heightCm: 180, goal: 'lose' as const }
  const auto = calcTargets({
    sex: 'male', birthDate: '1996-01-01', activity: 'light', ratePerWeek: 0.5, ...body,
  }, NOW).targets

  /**
   * Экран «Ваша норма» показывал авторасчётные углеводы, а сохранял
   * пересчитанные под ручные калории: 171 г на экране, 71 г в дневнике.
   * Теперь и показ, и сохранение делят калории одной функцией — и если
   * вписать ту же цифру, что у авторасчёта, выйдет та же норма.
   */
  it('те же калории, что у авторасчёта, дают те же БЖУ', () => {
    expect(splitMacros(auto.kcal, body)).toEqual(auto)
  })

  it('БЖУ под ручные калории не противоречат самим калориям', () => {
    const t = splitMacros(1000, body)
    expect(t.kcal).toBe(1000)
    expect(macrosOverKcal(t)).toBeNull()
  })
})

describe('форма нормы в профиле', () => {
  const saved: NormValues = { kcal: 2000, protein: 160, fat: 64, carbs: 196, water: 2400, glass: 250 }
  const form = normFormFrom(saved)

  it('нетронутая форма ничего не сохраняет', () => {
    const c = checkNormForm(form, saved)
    expect(c.targetsChanged).toBe(false)
    expect(c.waterChanged).toBe(false)
    expect(c.errors).toEqual({})
  })

  /** Раньше «5» вместо «1500» сохранялось молча, и любой день был перебором */
  it('ловит опечатки в калориях и БЖУ', () => {
    const c = checkNormForm({ ...form, kcal: '5', protein: '900' }, saved)
    expect(c.errors.kcal).toBeTruthy()
    expect(c.errors.protein).toBeTruthy()
    expect(c.values).toBeNull()
  })

  it('стёртое поле — ошибка, а не ноль', () => {
    const c = checkNormForm({ ...form, fat: '' }, saved)
    expect(c.errors.fat).toBe('Впишите число')
  })

  it('принимает разумную ручную норму', () => {
    const c = checkNormForm({ ...form, kcal: '1800' }, saved)
    expect(c.errors).toEqual({})
    expect(c.targetsChanged).toBe(true)
    expect(c.values?.kcal).toBe(1800)
  })

  /**
   * Смена стакана с 250 на 300 мл выключала авторасчёт: вся карточка
   * сохранялась как ручная норма, и вес переставал менять калории.
   */
  it('стакан и вода — не норма еды', () => {
    const c = checkNormForm({ ...form, glass: '300' }, saved)
    expect(c.targetsChanged).toBe(false)
    expect(c.waterChanged).toBe(true)
    expect(c.values?.glass).toBe(300)
  })

  it('стакан вне пределов не обрезается молча, а показывает ошибку', () => {
    expect(checkNormForm({ ...form, glass: '5000' }, saved).errors.glass).toBeTruthy()
  })

  /**
   * Сохранённое значение могло прийти из авторасчёта и выйти за пределы
   * (у крупного человека норма бывает выше 6000). Это не повод не дать
   * поправить воду.
   */
  it('проверяет только тронутые поля', () => {
    const big = { ...saved, kcal: 7200 }
    const c = checkNormForm({ ...normFormFrom(big), water: '3000' }, big)
    expect(c.errors).toEqual({})
    expect(c.values?.water).toBe(3000)
  })

  it('предупреждает о норме ниже базового обмена и о перерасходе белков и жиров', () => {
    const low = checkNormForm({ ...form, kcal: '1000' }, saved, 1700)
    expect(low.belowBmr).toBe(true)
    expect(low.overKcal).toBe(160 * 4 + 64 * 9)
    expect(checkNormForm({ ...form, kcal: '1900' }, saved, 1700).belowBmr).toBe(false)
  })

  it('не ругает нетронутую норму, даже если она противоречива', () => {
    const legacy = { ...saved, kcal: 1100 }
    expect(checkNormForm(normFormFrom(legacy), legacy).overKcal).toBeNull()
  })
})

describe('дата рождения после правки анкеты', () => {
  /**
   * Сохранение анкеты переписывало дату рождения на «сегодня минус возраст»:
   * поменяли в сентябре активность — и в октябре возраст не прибавлялся.
   */
  it('не трогает дату, если возраст не меняли', () => {
    expect(birthDateAfterEdit('1995-10-15', 30, NOW)).toBe('1995-10-15')
  })

  it('пересобирает дату, если возраст поменяли', () => {
    const next = birthDateAfterEdit('1995-10-15', 35, NOW)
    expect(ageFrom(next, NOW)).toBe(35)
  })
})
