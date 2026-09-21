import { describe, expect, it } from 'vitest'
import { lossOptions, safePlan, type PlanBody } from '@/domain/targets'
import {
  LOSE_PACE_HINT, TEEN_PACE_HINT, belowHealthy, healthyMinKg, limitPick,
  lossLimitHint, planNote, prose, roundRate, shownRate,
} from './limits'

const adult: PlanBody = { weightKg: 80, heightCm: 180, age: 30 }
const teen: PlanBody = { weightKg: 60, heightCm: 170, age: 16 }
// 175 см и 55 кг — ИМТ 17,96
const thin: PlanBody = { weightKg: 55, heightCm: 175, age: 30 }

describe('выбор цели и темпа под пределы', () => {
  it('пока анкета не заполнена, выбор не трогается', () => {
    expect(limitPick('lose', 1, null)).toEqual({ goal: 'lose', rate: 1 })
  })

  it('удержание и набор не трогаются', () => {
    const loss = lossOptions(thin)
    expect(limitPick('keep', 0, loss)).toEqual({ goal: 'keep', rate: 0 })
    expect(limitPick('gain', 0.5, loss)).toEqual({ goal: 'gain', rate: 0.5 })
  })

  /**
   * «Снизить вес» стоит в анкете по умолчанию. При ИМТ ниже 18,5 человек
   * не должен дойти до нормы с недоступной целью — выбор становится удержанием.
   */
  it('при ИМТ ниже 18,5 снижение становится удержанием', () => {
    expect(limitPick('lose', 0.5, lossOptions(thin))).toEqual({ goal: 'keep', rate: 0 })
  })

  it('подростку темп по умолчанию 0,5 сдвигается к 0,25', () => {
    expect(limitPick('lose', 0.5, lossOptions(teen))).toEqual({ goal: 'lose', rate: 0.25 })
  })

  it('темп выше 1 % сдвигается к самому быстрому доступному', () => {
    // 63 кг: потолок 0,63 — доступны 0,25 и 0,5
    const loss = lossOptions({ weightKg: 63, heightCm: 170, age: 30 })
    expect(limitPick('lose', 1, loss)).toEqual({ goal: 'lose', rate: 0.5 })
    expect(limitPick('lose', 0.25, loss)).toEqual({ goal: 'lose', rate: 0.25 })
  })

  it('доступный темп остаётся как выбран', () => {
    expect(limitPick('lose', 0.75, lossOptions(adult))).toEqual({ goal: 'lose', rate: 0.75 })
  })

  it('темп не из списка (старая копия) судится по потолку', () => {
    expect(limitPick('lose', 0.3, lossOptions(teen))).toEqual({ goal: 'lose', rate: 0.25 })
    expect(limitPick('lose', 0.3, lossOptions(adult))).toEqual({ goal: 'lose', rate: 0.3 })
  })

  /** Выбор формы и норма не расходятся: отмеченный план safePlan не урезает */
  it('отмеченный план проходит пределы как есть', () => {
    for (const body of [adult, teen, thin, { weightKg: 50, heightCm: 160, age: 40 }]) {
      for (const rate of [0.25, 0.5, 0.75, 1]) {
        const pick = limitPick('lose', rate, lossOptions(body))
        expect(safePlan({ ...body, goal: pick.goal, ratePerWeek: pick.rate }).limitedBy).toBeNull()
      }
    }
  })
})

describe('объяснение недоступных темпов', () => {
  it('подростку — про возраст', () => {
    expect(lossLimitHint(lossOptions(teen), 16)).toBe(TEEN_PACE_HINT)
  })

  it('взрослому с урезанными темпами — про 1 % с его числом', () => {
    const hint = lossLimitHint(lossOptions({ weightKg: 63, heightCm: 170, age: 30 }), 30)
    expect(hint).toBe(`${LOSE_PACE_HINT} При вашем весе это до 0,63 кг — более быстрые темпы недоступны.`)
  })

  it('когда доступно всё, объяснять нечего', () => {
    expect(lossLimitHint(lossOptions({ weightKg: 100, heightCm: 180, age: 30 }), 30)).toBeNull()
    // Вес неизвестен (взвешиваний нет) — у взрослого потолка нет
    expect(lossLimitHint(lossOptions({ weightKg: null, heightCm: 180, age: 30 }), 30)).toBeNull()
  })
})

describe('строка под анкетой', () => {
  const plan = (body: PlanBody, rate: number) => safePlan({ ...body, goal: 'lose', ratePerWeek: rate })

  it('план как в анкете — строки нет', () => {
    expect(planNote(plan(adult, 0.5), false)).toBeNull()
  })

  it('недостаток веса: при авторасчёте — о норме, при ручной — о плане', () => {
    expect(planNote(plan(thin, 0.5), false))
      .toBe('Снижение веса приостановлено: ИМТ ниже 18,5, норма рассчитана на поддержание.')
    expect(planNote(plan(thin, 0.5), true)).toContain('Норма задана вручную и не менялась.')
  })

  it('возраст и 1 % — с урезанным темпом через запятую', () => {
    expect(planNote(plan(teen, 1), false))
      .toBe('Темп снижен до 0,25 кг/нед: до 18 лет — только мягкий темп.')
    expect(planNote(plan({ weightKg: 70, heightCm: 175, age: 30 }, 1), false))
      .toBe('Темп снижен до 0,7 кг/нед — не больше 1 % веса в неделю.')
  })

  it('в строке «Цель» урезанный темп округлён, выбранный — как есть', () => {
    expect(shownRate(plan({ weightKg: 63.4, heightCm: 175, age: 30 }, 1))).toBe(0.63)
    expect(shownRate({ goal: 'gain', ratePerWeek: 0.125, limitedBy: null })).toBe(0.125)
  })
})

describe('числа', () => {
  it('темп округляется вниз до сотых без шума дробей', () => {
    expect(roundRate(0.63)).toBe(0.63)
    expect(roundRate(0.7000000000000001)).toBe(0.7)
    expect(roundRate(0.634)).toBe(0.63)
    expect(roundRate(0.25)).toBe(0.25)
  })

  it('в тексте — запятая', () => {
    expect(prose(0.63)).toBe('0,63')
    expect(prose(1)).toBe('1')
  })
})

describe('целевой вес и рост', () => {
  it('нижняя граница — вверх до целых, чтобы сама не оказалась ниже', () => {
    expect(healthyMinKg(175)).toBe(57) // 56,66
    expect(healthyMinKg(160)).toBe(48) // 47,36
    expect(belowHealthy(healthyMinKg(160), 160)).toBe(false)
  })

  it('ровно 18,5 — уже не ниже здорового', () => {
    // 200 см: 18,5 × 4 = 74 кг
    expect(belowHealthy(74, 200)).toBe(false)
    expect(belowHealthy(73.9, 200)).toBe(true)
  })
})
