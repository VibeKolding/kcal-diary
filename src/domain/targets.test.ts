import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_FACTORS, GOAL_RATES, MAX_AUTO_WATER_ML, MIN_CARBS_SHARE, TEEN_MAX_LOSS, ageFrom,
  birthDateFromAge, bmi, bmr, calcTargets, canLose, lossOptions, maxLoss, referenceWeight,
  safePlan, splitMacros, tdee, waterGoalFor,
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
    // темп урезан до 1 % от 80 кг: 2447.5 - 0.8×1100 = 1567.5, что ниже
    // BMR 1780 → подъём до BMR
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

describe('пределы снижения веса', () => {
  const adult = { heightCm: 180, weightKg: 80, age: 30 }

  it('ИМТ — килограммы на квадрат роста в метрах', () => {
    expect(bmi(74, 200)).toBe(18.5)
    expect(bmi(81, 180)).toBeCloseTo(25, 9)
  })

  it('взрослому с обычным весом оставляет план как есть', () => {
    expect(safePlan({ ...adult, goal: 'lose', ratePerWeek: 0.5 }))
      .toEqual({ goal: 'lose', ratePerWeek: 0.5, limitedBy: null })
  })

  it('ИМТ ровно 18,5 снижать ещё можно, чуть ниже — уже нет', () => {
    // 74 кг при 200 см — ИМТ ровно 18,5
    const edge = { heightCm: 200, age: 30, goal: 'lose' as const, ratePerWeek: 0.5 }
    expect(canLose(74, 200)).toBe(true)
    expect(safePlan({ ...edge, weightKg: 74 })).toEqual({ goal: 'lose', ratePerWeek: 0.5, limitedBy: null })
    expect(canLose(73.9, 200)).toBe(false)
    expect(safePlan({ ...edge, weightKg: 73.9 })).toEqual({ goal: 'keep', ratePerWeek: 0, limitedBy: 'underweight' })
  })

  it('не больше 1 % массы тела в неделю', () => {
    // 50 кг при 160 см — ИМТ 19,5, снижать можно, но не быстрее 0,5 кг
    const light = { heightCm: 160, weightKg: 50, age: 30, goal: 'lose' as const }
    expect(safePlan({ ...light, ratePerWeek: 0.5 })).toEqual({ goal: 'lose', ratePerWeek: 0.5, limitedBy: null })
    expect(safePlan({ ...light, ratePerWeek: 0.75 })).toEqual({ goal: 'lose', ratePerWeek: 0.5, limitedBy: 'share' })
    expect(safePlan({ ...light, ratePerWeek: 1 })).toEqual({ goal: 'lose', ratePerWeek: 0.5, limitedBy: 'share' })
  })

  it('урезает до доли массы как есть, без округления к кнопкам', () => {
    const p = safePlan({ heightCm: 170, weightKg: 63, age: 30, goal: 'lose', ratePerWeek: 1 })
    expect(p.ratePerWeek).toBeCloseTo(0.63, 9)
    expect(p.limitedBy).toBe('share')
  })

  it('до 18 лет — не быстрее 0,25 кг в неделю', () => {
    const teen = { heightCm: 175, weightKg: 70, age: 17, goal: 'lose' as const }
    expect(safePlan({ ...teen, ratePerWeek: 1 })).toEqual({ goal: 'lose', ratePerWeek: TEEN_MAX_LOSS, limitedBy: 'teen' })
    expect(safePlan({ ...teen, ratePerWeek: 0.25 })).toEqual({ goal: 'lose', ratePerWeek: 0.25, limitedBy: null })
    expect(safePlan({ ...teen, age: 18, ratePerWeek: 0.5 })).toEqual({ goal: 'lose', ratePerWeek: 0.5, limitedBy: null })
  })

  it('у подростка действует меньший из двух потолков, и назван именно он', () => {
    // 24 кг при 110 см — ИМТ 19,8; 1 % массы — 0,24 кг, строже возрастного
    const small = { heightCm: 110, weightKg: 24, age: 15, goal: 'lose' as const }
    const p = safePlan({ ...small, ratePerWeek: 1 })
    expect(p.ratePerWeek).toBeCloseTo(0.24, 9)
    expect(p.limitedBy).toBe('share')
    expect(safePlan({ ...small, ratePerWeek: 0.25 }).limitedBy).toBe('share')
    // При 25 кг потолки совпадают — называется возраст
    expect(maxLoss(25, 15)).toEqual({ rate: 0.25, by: 'teen' })
    // Обычный подросток: возрастной потолок строже 1 %
    expect(maxLoss(60, 15)).toEqual({ rate: 0.25, by: 'teen' })
  })

  it('недостаток веса важнее возраста', () => {
    expect(safePlan({ heightCm: 170, weightKg: 45, age: 15, goal: 'lose', ratePerWeek: 0.25 }))
      .toEqual({ goal: 'keep', ratePerWeek: 0, limitedBy: 'underweight' })
  })

  it('без взвешиваний действует только возраст', () => {
    expect(safePlan({ heightCm: 180, weightKg: null, age: 30, goal: 'lose', ratePerWeek: 1 }))
      .toEqual({ goal: 'lose', ratePerWeek: 1, limitedBy: null })
    expect(safePlan({ heightCm: 180, weightKg: null, age: 16, goal: 'lose', ratePerWeek: 1 }))
      .toEqual({ goal: 'lose', ratePerWeek: 0.25, limitedBy: 'teen' })
    expect(maxLoss(null, 30)).toBeNull()
    expect(canLose(null, 180)).toBe(true)
  })

  it('удержание и набор не трогает', () => {
    const thin = { heightCm: 180, weightKg: 50, age: 15 }
    expect(safePlan({ ...thin, goal: 'gain', ratePerWeek: 0.5 })).toEqual({ goal: 'gain', ratePerWeek: 0.5, limitedBy: null })
    expect(safePlan({ ...thin, goal: 'keep', ratePerWeek: 0 })).toEqual({ goal: 'keep', ratePerWeek: 0, limitedBy: null })
  })

  describe('темпы для экрана', () => {
    it('помечает недоступные темпы той же причиной, что и расчёт', () => {
      const o = lossOptions({ heightCm: 160, weightKg: 50, age: 30 })
      expect(o.canLose).toBe(true)
      expect(o.cap).toEqual({ rate: 0.5, by: 'share' })
      expect(o.options).toEqual([
        { rate: 0.25, allowed: true, reason: null },
        { rate: 0.5, allowed: true, reason: null },
        { rate: 0.75, allowed: false, reason: 'share' },
        { rate: 1, allowed: false, reason: 'share' },
      ])
    })

    it('подростку оставляет только 0,25', () => {
      const o = lossOptions({ heightCm: 175, weightKg: 70, age: 16 })
      expect(o.options.map((x) => x.allowed)).toEqual([true, false, false, false])
      expect(o.options.slice(1).every((x) => x.reason === 'teen')).toBe(true)
    })

    it('при недостатке веса снижение недоступно целиком', () => {
      const o = lossOptions({ heightCm: 180, weightKg: 55, age: 30 })
      expect(o.canLose).toBe(false)
      expect(o.options.every((x) => !x.allowed && x.reason === 'underweight')).toBe(true)
    })

    it('без веса у взрослого ограничений нет', () => {
      const o = lossOptions({ heightCm: 180, weightKg: null, age: 30 })
      expect(o.cap).toBeNull()
      expect(o.options.every((x) => x.allowed)).toBe(true)
    })
  })

  describe('в расчёте нормы', () => {
    const body = {
      sex: 'female' as const, heightCm: 165, weightKg: 45, activity: 'light' as const,
      birthDate: '1996-09-07',
    }

    it('при недостатке веса считает норму удержания, а не дефицит', () => {
      // 45 кг при 165 см — ИМТ 16,5
      const lose = calcTargets({ ...body, goal: 'lose', ratePerWeek: 1 }, NOW)
      const keep = calcTargets({ ...body, goal: 'keep', ratePerWeek: 0 }, NOW)
      expect(lose.targets).toEqual(keep.targets)
      expect(lose.clampedToBmr).toBe(false)
      expect(lose.plan).toEqual({ goal: 'keep', ratePerWeek: 0, limitedBy: 'underweight' })
      expect(keep.plan).toEqual({ goal: 'keep', ratePerWeek: 0, limitedBy: null })
    })

    /* Возраст — на дату расчёта: 17 лет накануне дня рождения, 18 в сам день */
    it('до 18 лет дефицит не больше, чем на 0,25 кг в неделю', () => {
      const teen = {
        sex: 'male' as const, heightCm: 175, weightKg: 70, activity: 'high' as const,
        goal: 'lose' as const, ratePerWeek: 1,
      }
      const at17 = calcTargets({ ...teen, birthDate: '2008-09-08' }, NOW)
      const slow = calcTargets({ ...teen, birthDate: '2008-09-08', ratePerWeek: 0.25 }, NOW)
      expect(at17.plan).toEqual({ goal: 'lose', ratePerWeek: 0.25, limitedBy: 'teen' })
      expect(at17.targets).toEqual(slow.targets)
      // дефицит 0.25 × 7700 / 7 = 275 ккал
      expect(at17.targets.kcal).toBe(Math.round((at17.tdee - 275) / 10) * 10)
      expect(at17.clampedToBmr).toBe(false)

      const at18 = calcTargets({ ...teen, birthDate: '2008-09-07' }, NOW)
      expect(at18.plan.limitedBy).toBe('share')
      expect(at18.plan.ratePerWeek).toBeCloseTo(0.7, 9)
    })

    it('на наборе при недостатке веса план не меняет', () => {
      const r = calcTargets({ ...body, goal: 'gain', ratePerWeek: 0.25 }, NOW)
      expect(r.plan).toEqual({ goal: 'gain', ratePerWeek: 0.25, limitedBy: null })
      expect(r.targets.kcal).toBeGreaterThan(r.tdee)
    })
  })
})
