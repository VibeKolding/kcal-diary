import type { Activity, Goal, Nutrients, Profile, Sex } from './types'
import { parseDay } from './dates'

export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  athlete: 1.9,
}

export const ACTIVITY_LABELS: Record<Activity, { title: string; hint: string }> = {
  sedentary: { title: 'Сидячий', hint: 'офис, мало ходьбы' },
  light: { title: 'Лёгкий', hint: 'тренировки 1–3 раза в неделю' },
  moderate: { title: 'Средний', hint: 'тренировки 3–5 раз в неделю' },
  high: { title: 'Высокий', hint: 'тренировки 6–7 раз в неделю' },
  athlete: { title: 'Очень высокий', hint: 'физический труд или две тренировки в день' },
}

/** 1 кг жировой ткани ≈ 7700 ккал */
const KCAL_PER_KG = 7700

/**
 * Требования по БЖУ различаются по целям, и это не косметика.
 *
 * На дефиците белок поднимают до 2 г/кг: он защищает мышцы, когда еды меньше,
 * чем тратит организм, — иначе вес уходит в том числе за счёт мышц.
 * На поддержании и наборе такой нужды нет, зато жиры возвращают к 1 г/кг:
 * ниже этого страдает гормональный фон.
 */
export const GOAL_MACROS: Record<Goal, { protein: number; fat: number }> = {
  lose: { protein: 2.0, fat: 0.8 },
  keep: { protein: 1.6, fat: 1.0 },
  gain: { protein: 1.8, fat: 1.0 },
}

export const GOAL_LABELS: Record<Goal, { title: string; hint: string }> = {
  lose: { title: 'Снизить вес', hint: 'дефицит калорий, больше белка' },
  keep: { title: 'Удержать вес', hint: 'норма поддержания' },
  gain: { title: 'Набрать массу', hint: 'умеренный профицит' },
}

/**
 * Разумный темп для каждой цели.
 *
 * Набирать быстрее 0.5 кг в неделю нет смысла: мышцы так быстро не растут,
 * и лишнее уходит в жир. Поэтому для набора список короче.
 */
export const GOAL_RATES: Record<Goal, number[]> = {
  lose: [0.25, 0.5, 0.75, 1],
  keep: [0],
  gain: [0.125, 0.25, 0.5],
}

/**
 * Дата рождения из возраста.
 *
 * Спрашивать возраст проще, чем дату, а хранить всё равно нужно дату —
 * иначе возраст замрёт и норма перестанет меняться с годами.
 */
export function birthDateFromAge(age: number, now = new Date()): string {
  const year = now.getFullYear() - age
  const month = now.getMonth()
  // 29 февраля в невисокосном году Date сам переносит на 1 марта, и возраст
  // выходил на год меньше. Прижимаем день к последнему дню месяца.
  const lastDay = new Date(year, month + 1, 0).getDate()
  const day = Math.min(now.getDate(), lastDay)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function ageFrom(birthDate: string, now = new Date()): number {
  // parseDay, а не new Date: строку «ГГГГ-ММ-ДД» Date читает как полночь
  // по UTC, и западнее Гринвича день рождения наступал на сутки раньше
  const b = parseDay(birthDate)
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1
  return age
}

/** Базовый обмен по Миффлину–Сан Жеору */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

export function tdee(bmrValue: number, activity: Activity): number {
  return bmrValue * ACTIVITY_FACTORS[activity]
}

export interface TargetInput {
  sex: Sex
  birthDate: string
  heightCm: number
  weightKg: number
  activity: Activity
  goal: Goal
  /** кг в неделю, всегда положительное число; направление задаёт goal */
  ratePerWeek: number
}

export interface TargetResult {
  targets: Nutrients
  bmr: number
  tdee: number
  /** Норму подняли до уровня базового обмена — темп цели недостижим безопасно */
  clampedToBmr: boolean
}

/**
 * Вес, от которого считаются белок и жиры.
 *
 * Граммы на килограмм придуманы для обычного телосложения. Жировая ткань
 * почти не требует белка, и при весе 130 кг «2 г/кг» давали 260 г белка —
 * вместе с жирами больше калорий, чем во всей норме, и 0 г углеводов.
 * Поэтому выше ИМТ 25 берётся скорректированный вес: вес при ИМТ 25 плюс
 * 40 % лишнего — так его считают диетологи для людей с ожирением.
 */
export function referenceWeight(weightKg: number, heightCm: number): number {
  const h = heightCm / 100
  const atBmi25 = 25 * h * h
  if (!(atBmi25 > 0) || weightKg <= atBmi25) return weightKg
  return atBmi25 + 0.4 * (weightKg - atBmi25)
}

/** Доля нормы, которая при любом раскладе остаётся углеводам */
export const MIN_CARBS_SHARE = 0.2
/** Ниже этого жиры не опускаются, даже когда белку и жирам тесно, г/кг */
export const MIN_FAT_PER_KG = 0.6

/**
 * Белки, жиры и углеводы под заданную калорийность.
 *
 * Белок и жиры — требования цели (GOAL_MACROS) от опорного веса, остаток
 * уходит в углеводы. Если белку и жирам тесно, углеводам всё равно
 * остаётся не меньше пятой части нормы: сначала жиры опускаются к 0,6 г/кг,
 * потом уменьшается белок. Иначе при низкой норме выходили 0 г углеводов,
 * а сумма БЖУ противоречила самой калорийности.
 */
export function splitMacros(
  kcal: number,
  body: { weightKg: number; heightCm: number; goal: Goal },
): Nutrients {
  const ref = referenceWeight(body.weightKg, body.heightCm)
  const macros = GOAL_MACROS[body.goal]
  const budget = Math.max(0, kcal * (1 - MIN_CARBS_SHARE))
  let protein = Math.round(ref * macros.protein)
  let fat = Math.round(ref * macros.fat)

  const over = () => protein * 4 + fat * 9 - budget
  if (over() > 0) fat = Math.max(Math.round(ref * MIN_FAT_PER_KG), fat - Math.ceil(over() / 9))
  if (over() > 0) protein = Math.max(0, protein - Math.ceil(over() / 4))
  if (over() > 0) fat = Math.max(0, Math.floor(budget / 9))

  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, fat, carbs }
}

/**
 * Норма калорий и БЖУ.
 *
 * Калории: TDEE ± дефицит/профицит, рассчитанный из желаемого темпа.
 * Пол ограничен снизу величиной базового обмена: опускаться ниже BMR небезопасно,
 * поэтому в таком случае норма поднимается до BMR и поднимается флаг clampedToBmr.
 *
 * БЖУ: см. splitMacros.
 */
export function calcTargets(input: TargetInput, now = new Date()): TargetResult {
  const age = ageFrom(input.birthDate, now)
  const bmrValue = bmr(input.sex, input.weightKg, input.heightCm, age)
  const tdeeValue = tdee(bmrValue, input.activity)

  const dailyDelta = (input.ratePerWeek * KCAL_PER_KG) / 7
  let kcal = tdeeValue
  if (input.goal === 'lose') kcal = tdeeValue - dailyDelta
  if (input.goal === 'gain') kcal = tdeeValue + dailyDelta

  let clampedToBmr = false
  if (kcal < bmrValue) {
    kcal = bmrValue
    clampedToBmr = true
  }

  kcal = Math.round(kcal / 10) * 10
  // Округление до десятков могло опустить норму на пару калорий под BMR —
  // и она разошлась бы с обещанным «не ниже базового обмена». Тогда вверх.
  if (kcal < bmrValue) kcal = Math.ceil(bmrValue / 10) * 10

  return {
    targets: splitMacros(kcal, input),
    bmr: Math.round(bmrValue),
    tdee: Math.round(tdeeValue),
    clampedToBmr,
  }
}

/** Пересчёт нормы для существующего профиля при смене веса или анкеты */
export function targetsForProfile(profile: Profile, weightKg: number, now = new Date()): TargetResult {
  return calcTargets(
    {
      sex: profile.sex,
      birthDate: profile.birthDate,
      heightCm: profile.heightCm,
      weightKg,
      activity: profile.activity,
      goal: profile.goal,
      ratePerWeek: profile.ratePerWeek,
    },
    now,
  )
}

/** Потолок автоматической нормы воды, мл */
export const MAX_AUTO_WATER_ML = 4000

/**
 * Норма воды по весу: 30 мл на килограмм. Без потолка при 300 кг выходило
 * 9 литров — пить столько буквально опасно, поэтому выше 4 л не поднимаем.
 * Руками в профиле можно поставить любую.
 */
export function waterGoalFor(weightKg: number): number {
  return Math.min(MAX_AUTO_WATER_ML, Math.round(weightKg * 30))
}
