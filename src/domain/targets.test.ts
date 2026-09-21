import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_FACTORS, GOAL_RATES, MAX_AUTO_WATER_ML, MIN_CARBS_SHARE, ageFrom, birthDateFromAge,
  bmr, calcTargets, referenceWeight, splitMacros, tdee, waterGoalFor,
} from './targets'

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

  /*
   * new Date('1996-10-01') — это полночь по UTC. В Нью-Йорке это ещё
   * 30 сентября, и возраст прибавлялся на сутки раньше дня рождения.
   */
  it('читает дату рождения по местному времени, а не по UTC', () => {
    const tz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(ageFrom('1996-10-01', new Date(2027, 8, 30, 12))).toBe(30)
      expect(ageFrom('1996-10-01', new Date(2027, 9, 1, 0, 1))).toBe(31)
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
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

  /*
   * Женщина 45 лет, 165 см, 130 кг на снижении получала 260 г белка,
   * 104 г жиров и 0 г углеводов: белок и жиры вдвоём давали больше
   * калорий, чем вся норма.
   */
  it('при большом весе оставляет углеводы и не превышает норму белком и жирами', () => {
    const cases = [
      { sex: 'female' as const, birthDate: '1981-09-07', heightCm: 165, weightKg: 130, activity: 'sedentary' as const },
      { sex: 'male' as const, birthDate: '1996-09-07', heightCm: 180, weightKg: 300, activity: 'sedentary' as const },
      { sex: 'female' as const, birthDate: '1966-09-07', heightCm: 150, weightKg: 45, activity: 'sedentary' as const },
      { sex: 'female' as const, birthDate: '1936-09-07', heightCm: 100, weightKg: 30, activity: 'sedentary' as const },
    ]
    for (const c of cases) {
      for (const goal of ['lose', 'keep', 'gain'] as const) {
        for (const ratePerWeek of GOAL_RATES[goal]) {
          const { targets: t } = calcTargets({ ...c, goal, ratePerWeek }, NOW)
          expect(t.protein * 4 + t.fat * 9).toBeLessThanOrEqual(t.kcal * (1 - MIN_CARBS_SHARE))
          expect(t.carbs * 4).toBeGreaterThanOrEqual(t.kcal * MIN_CARBS_SHARE - 2)
          expect(Math.abs(t.protein * 4 + t.fat * 9 + t.carbs * 4 - t.kcal)).toBeLessThanOrEqual(4)
        }
      }
    }
  })

  it('белок при ожирении считает от скорректированного веса', () => {
    const r = calcTargets({
      sex: 'female', birthDate: '1981-09-07', heightCm: 165, weightKg: 130,
      activity: 'sedentary', goal: 'lose', ratePerWeek: 0.5,
    }, NOW)
    // вес при ИМТ 25 — 68 кг, плюс 40 % лишнего ≈ 93 кг, ×2 г
    expect(r.targets.protein).toBe(186)
    expect(r.targets.carbs).toBeGreaterThan(100)
  })

  /*
   * BMR 2293 после округления до десятков давал норму 2290 — ниже
   * базового обмена, хотя экран обещал «не ниже».
   */
  it('после округления норма не опускается ниже базового обмена', () => {
    const r = calcTargets({
      sex: 'male', birthDate: '1996-09-07', heightCm: 150, weightKg: 150,
      activity: 'light', goal: 'lose', ratePerWeek: 1,
    }, NOW)
    expect(r.clampedToBmr).toBe(true)
    expect(r.bmr % 10).not.toBe(0)
    expect(r.targets.kcal).toBeGreaterThanOrEqual(r.bmr)
    expect(r.targets.kcal % 10).toBe(0)
  })
})

describe('referenceWeight и splitMacros', () => {
  it('при нормальном весе берёт настоящий вес', () => {
    expect(referenceWeight(80, 180)).toBe(80)
  })

  it('выше ИМТ 25 прибавляет только 40 % лишнего', () => {
    // 25 × 1.8² = 81 кг
    expect(referenceWeight(181, 180)).toBeCloseTo(121, 5)
  })

  it('при тесной норме сначала урезает жиры, потом белок, но углеводы оставляет', () => {
    const m = splitMacros(1000, { weightKg: 80, heightCm: 180, goal: 'lose' })
    expect(m.fat).toBe(48) // 0.6 г/кг
    expect(m.protein * 4 + m.fat * 9).toBeLessThanOrEqual(800)
    expect(m.carbs).toBeGreaterThanOrEqual(50)
  })
})

describe('норма воды', () => {
  it('30 мл на килограмм, но не больше 4 литров', () => {
    expect(waterGoalFor(80)).toBe(2400)
    expect(waterGoalFor(300)).toBe(MAX_AUTO_WATER_ML)
  })
})

describe('birthDateFromAge', () => {
  it('даёт дату, из которой сегодня получается ровно тот же возраст', () => {
    for (const age of [14, 30, 47, 100]) {
      expect(ageFrom(birthDateFromAge(age, NOW), NOW)).toBe(age)
    }
  })

  /* 29 февраля в невисокосном году Date переносил на 1 марта — возраст выходил на год меньше */
  it('в високосный день не теряет год', () => {
    const leap = new Date(2028, 1, 29, 12)
    for (const age of [14, 30, 31, 47]) {
      const date = birthDateFromAge(age, leap)
      expect(ageFrom(date, leap)).toBe(age)
    }
    expect(birthDateFromAge(30, leap)).toBe('1998-02-28')
    expect(birthDateFromAge(32, leap)).toBe('1996-02-29')
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
