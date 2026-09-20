import type { Activity, Goal, Nutrients, Profile, Sex } from './types'

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
  const d = new Date(now.getFullYear() - age, now.getMonth(), now.getDate())
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function ageFrom(birthDate: string, now = new Date()): number {
  const b = new Date(birthDate)
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
 * Норма калорий и БЖУ.
 *
 * Калории: TDEE ± дефицит/профицит, рассчитанный из желаемого темпа.
 * Пол ограничен снизу величиной базового обмена: опускаться ниже BMR небезопасно,
 * поэтому в таком случае норма поднимается до BMR и поднимается флаг clampedToBmr.
 *
 * БЖУ: белок и жиры берутся из профиля цели (см. GOAL_MACROS),
 * остаток калорий уходит в углеводы.
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

  const macros = GOAL_MACROS[input.goal]
  const protein = Math.round(input.weightKg * macros.protein)
  const fat = Math.round(input.weightKg * macros.fat)
  const carbsKcal = kcal - protein * 4 - fat * 9
  // При очень низкой норме углеводы могли бы уйти в минус — прижимаем к нулю.
  const carbs = Math.max(0, Math.round(carbsKcal / 4))

  return {
    targets: { kcal, protein, fat, carbs },
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
