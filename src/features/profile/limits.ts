import {
  ADULT_AGE, UNDERWEIGHT_BMI, canLose,
  type LossOptions, type SafePlan,
} from '@/domain/targets'
import type { Goal } from '@/domain/types'

/*
 * Пределы снижения веса на экранах: анкета, профиль, целевой вес.
 *
 * Сами пределы живут в domain/targets (safePlan, lossOptions) и действуют
 * при любом расчёте нормы. Здесь — то, что экрану нужно поверх них: какой
 * выбор показать отмеченным и какими словами объяснить, почему часть
 * вариантов недоступна. Тексты общие для анкеты и профиля, чтобы одно и то же
 * правило не объяснялось на двух экранах по-разному.
 */

/** Подсказка у «Снизить вес», когда снижение недоступно */
export const LOSE_LOCKED_HINT = 'Недоступно при таком росте и весе'

/** Пояснение под целями, когда снижение недоступно */
export const UNDERWEIGHT_NOTE =
  'При таком росте и весе снижать вес не стоит — ИМТ ниже 18,5. ' +
  'Если хотите изменить питание, лучше обсудить это с врачом.'

/** Обычная подсказка к темпу снижения — была в анкете и раньше */
export const LOSE_PACE_HINT =
  'Здоровый темп — до 1 % массы тела в неделю. Быстрее уходят мышцы, а не жир.'

export const TEEN_PACE_HINT =
  'До 18 лет — только самый мягкий темп: организм ещё растёт. ' +
  'Снижать вес лучше вместе с врачом.'

/** Шаг «Ваша норма» для младше 18 — при любой цели */
export const TEEN_NORM_NOTE =
  'Формула рассчитана на взрослых. До 18 лет энергии нужно больше — ' +
  'организм ещё растёт, поэтому считайте норму ориентиром и обсудите её с врачом.'

/**
 * Темп предела, округлённый вниз до сотых: 0,634 → 0,63.
 *
 * Потолок 1 % не круглый (при 63,4 кг это 0,634), а на экране нужно
 * короткое число. Вниз, а не к ближайшему: обещать чуть меньше предела
 * честнее, чем чуть больше. Допуск — от шума дробей: 0.63 * 100 даёт
 * 62.99999999999999, и без него вышло бы 0,62.
 */
export function roundRate(rate: number): number {
  return Math.floor(rate * 100 + 1e-6) / 100
}

/** Число для текста — с запятой, как пишут по-русски: «0,63» */
export function prose(n: number): string {
  return String(n).replace('.', ',')
}

/** Выбор цели и темпа, который форма показывает отмеченным и сохраняет */
export interface GoalPick {
  goal: Goal
  rate: number
}

/**
 * Цель и темп из формы, приведённые к пределам.
 *
 * Считается при каждом показе, а не только по нажатию: человек может
 * вернуться к первому шагу и поменять вес или возраст, и тогда уже
 * выбранное «Снизить вес» или темп 0,5 перестают подходить. Отмеченным
 * всегда стоит то, что допустимо сейчас, — с ним форма и уходит дальше.
 *
 * Недоступно снижение — выбор становится удержанием. Темп выше потолка
 * сдвигается к самому быстрому из доступных: 0,5 по умолчанию подростку
 * не подходит, и отмеченной должна стоять 0,25. Если недоступны все темпы
 * (так бывает только ниже 25 кг), остаётся самый мягкий — норму всё равно
 * ограничит safePlan.
 *
 * loss — null, пока пределы не из чего считать (анкета не заполнена).
 */
export function limitPick(goal: Goal, rate: number, loss: LossOptions | null): GoalPick {
  if (!loss || goal !== 'lose') return { goal, rate }
  if (!loss.canLose) return { goal: 'keep', rate: 0 }
  const option = loss.options.find((o) => o.rate === rate)
  // Темп не из списка бывает только в старой копии: судим по потолку
  const fits = option ? option.allowed : !(loss.cap && rate > loss.cap.rate)
  if (fits) return { goal, rate }
  const allowed = loss.options.filter((o) => o.allowed)
  return { goal, rate: (allowed[allowed.length - 1] ?? loss.options[0]!).rate }
}

/**
 * Почему часть темпов снижения недоступна. null — доступны все, и
 * объяснять нечего.
 *
 * Подростку — про возраст, даже если потолок совпал с 1 %: это объяснение
 * важнее. Взрослому — про 1 % массы тела, с его собственным числом.
 */
export function lossLimitHint(loss: LossOptions, age: number): string | null {
  if (age < ADULT_AGE) return TEEN_PACE_HINT
  if (loss.cap && loss.options.some((o) => o.reason === 'share')) {
    return `${LOSE_PACE_HINT} При вашем весе это до ${prose(roundRate(loss.cap.rate))} кг — более быстрые темпы недоступны.`
  }
  return null
}

/** Темп для строки «Цель» в профиле: урезанный — округлённым, выбранный — как есть */
export function shownRate(plan: SafePlan): number {
  return plan.limitedBy ? roundRate(plan.ratePerWeek) : plan.ratePerWeek
}

/**
 * Строка под анкетой, когда план урезан пределом. null — план как в анкете.
 *
 * При ручной норме говорим о плане, а не о норме: ручную норму пределы
 * не трогают, и написать «норма рассчитана на поддержание» было бы неправдой.
 */
export function planNote(plan: SafePlan, manual: boolean): string | null {
  const rate = prose(roundRate(plan.ratePerWeek))
  switch (plan.limitedBy) {
    case 'underweight':
      return manual
        ? 'Снижение веса приостановлено: ИМТ ниже 18,5, план — поддержание. Норма задана вручную и не менялась.'
        : 'Снижение веса приостановлено: ИМТ ниже 18,5, норма рассчитана на поддержание.'
    case 'teen':
      return `Темп снижен до ${rate} кг/нед: до 18 лет — только мягкий темп.`
    case 'share':
      return `Темп снижен до ${rate} кг/нед — не больше 1 % веса в неделю.`
    default:
      return null
  }
}

/** Целевой вес ниже здорового для этого роста — та же граница ИМТ 18,5 и тот же допуск */
export function belowHealthy(kg: number, heightCm: number): boolean {
  return !canLose(kg, heightCm)
}

/**
 * Нижняя граница здорового веса для роста, целых килограммов.
 * Вверх: при 160 см граница 47,36 кг, и «около 47» само оказалось бы ниже неё.
 */
export function healthyMinKg(heightCm: number): number {
  const h = heightCm / 100
  return Math.ceil(UNDERWEIGHT_BMI * h * h - 1e-6)
}
