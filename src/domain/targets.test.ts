import { describe, expect, it } from 'vitest'
import { ACTIVITY_FACTORS, GOAL_RATES, ageFrom, birthDateFromAge, bmr, calcTargets, tdee } from './targets'

const NOW = new Date('2026-09-07T12:00:00')

describe('ageFrom', () => {
  it('считает полные годы', () => {
    expect(ageFrom('1990-01-01', NOW)).toBe(36)
  })

  it('не засчитывает год, если день рождения ещё не наступил', () => {
    expect(ageFrom('1990-12-31', NOW)).toBe(35)
  })

  it('засчитывает год ровно в день рождения', () => {
    expect(ageFrom('1990-09-07', NOW)).toBe(36)
  })
})

describe('bmr по Миффлину–Сан Жеора', () => {
  it('мужчина 80 кг, 180 см, 30 лет', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(bmr('male', 80, 180, 30)).toBe(1780)
  })

  it('женщина 60 кг, 165 см, 30 лет', () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
    expect(bmr('female', 60, 165, 30)).toBeCloseTo(1320.25, 2)
  })
})

describe('tdee', () => {
  it('умножает базовый обмен на коэффициент активности', () => {
    expect(tdee(1800, 'moderate')).toBeCloseTo(2790, 5)
  })
})

describe('calcTargets', () => {
  const base = {
    sex: 'male' as const,
    birthDate: '1996-09-07',
    heightCm: 180,
    weightKg: 80,
    activity: 'light' as const,
    goal: 'keep' as const,
    ratePerWeek: 0,
  }

  it('на удержании даёт расход с активностью', () => {
    const r = calcTargets(base, NOW)
    expect(r.bmr).toBe(1780)
    expect(r.tdee).toBe(Math.round(1780 * 1.375))
    expect(r.targets.kcal).toBe(2450)
    expect(r.clampedToBmr).toBe(false)
  })

  it('на снижении вычитает дефицит из темпа', () => {
    const r = calcTargets({ ...base, goal: 'lose', ratePerWeek: 0.5 }, NOW)
    // 2447.5 - (0.5*7700/7 = 550) = 1897.5 → округление до десятков
    expect(r.targets.kcal).toBe(1900)
  })

  it('на наборе прибавляет профицит', () => {
    const r = calcTargets({ ...base, goal: 'gain', ratePerWeek: 0.25 }, NOW)
    expect(r.targets.kcal).toBe(2720)
  })

  it('не опускает норму ниже базового обмена', () => {
    const r = calcTargets({ ...base, goal: 'lose', ratePerWeek: 1 }, NOW)
    // 2447.5 - 1100 = 1347.5, что ниже BMR 1780 → подъём до BMR
    expect(r.targets.kcal).toBe(1780)
    expect(r.clampedToBmr).toBe(true)
  })

  it('на удержании берёт белок 1.6 г/кг и жиры 1.0 г/кг', () => {
    const r = calcTargets(base, NOW)
    expect(r.targets.protein).toBe(128)
    expect(r.targets.fat).toBe(80)
  })

  it('на снижении поднимает белок до 2 г/кг, чтобы сберечь мышцы', () => {
    const r = calcTargets({ ...base, goal: 'lose', ratePerWeek: 0.5 }, NOW)
    expect(r.targets.protein).toBe(160)
    expect(r.targets.fat).toBe(64)
  })

  it('на наборе даёт белок 1.8 г/кг и жиры 1.0 г/кг', () => {
    const r = calcTargets({ ...base, goal: 'gain', ratePerWeek: 0.25 }, NOW)
    expect(r.targets.protein).toBe(144)
    expect(r.targets.fat).toBe(80)
  })

  it('остаток калорий уходит в углеводы без потерь', () => {
    for (const goal of ['lose', 'keep', 'gain'] as const) {
      const r = calcTargets({ ...base, goal, ratePerWeek: 0.25 }, NOW)
      const fromMacros =
        r.targets.protein * 4 + r.targets.fat * 9 + r.targets.carbs * 4
      expect(Math.abs(fromMacros - r.targets.kcal)).toBeLessThanOrEqual(4)
    }
  })

  it('не уводит углеводы в минус при очень низкой норме', () => {
    const r = calcTargets(
      { ...base, weightKg: 150, heightCm: 150, goal: 'lose', ratePerWeek: 1 },
      NOW,
    )
    expect(r.targets.carbs).toBeGreaterThanOrEqual(0)
  })
})

describe('birthDateFromAge', () => {
  it('даёт дату, из которой сегодня получается ровно тот же возраст', () => {
    for (const age of [14, 30, 47, 100]) {
      expect(ageFrom(birthDateFromAge(age, NOW), NOW)).toBe(age)
    }
  })
})

describe('темпы по целям', () => {
  it('на наборе не предлагает быстрее 0.5 кг в неделю', () => {
    expect(Math.max(...GOAL_RATES.gain)).toBe(0.5)
  })

  it('на удержании темп только нулевой', () => {
    expect(GOAL_RATES.keep).toEqual([0])
  })

  it('коэффициенты активности идут по возрастанию', () => {
    const values = Object.values(ACTIVITY_FACTORS)
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  })
})
