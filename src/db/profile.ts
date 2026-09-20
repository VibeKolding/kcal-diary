import type { Nutrients, Profile } from '@/domain/types'
import { calcTargets, type TargetInput } from '@/domain/targets'
import { db, setMeta, META } from './db'
import { putWeight } from './tracking'
import { dayKey } from '@/domain/dates'

/**
 * Возвращает null, если профиля нет.
 *
 * Важно не отдавать undefined: useLiveQuery отдаёт undefined, пока запрос идёт,
 * и «профиля нет» стало бы неотличимо от «ещё грузится».
 */
export async function getProfile(): Promise<Profile | null> {
  return (await db.profile.get(1)) ?? null
}

export interface OnboardingInput extends TargetInput {
  waterGoalMl: number
  theme: Profile['theme']
}

export async function createProfile(input: OnboardingInput): Promise<Profile> {
  const { targets } = calcTargets(input)
  const profile: Profile = {
    id: 1,
    sex: input.sex,
    birthDate: input.birthDate,
    heightCm: input.heightCm,
    activity: input.activity,
    goal: input.goal,
    ratePerWeek: input.ratePerWeek,
    targets,
    targetsManual: false,
    theme: input.theme,
    waterGoalMl: input.waterGoalMl,
    createdAt: Date.now(),
  }
  await db.profile.put(profile)
  // Стартовый вес — первая точка графика, иначе кривая начнётся из пустоты
  await putWeight({ date: dayKey(), kg: input.weightKg })
  await setMeta(META.onboarded, true)

  // Данные живут только здесь, поэтому просим браузер их не вытеснять
  try {
    await navigator.storage?.persist?.()
  } catch {
    // не поддерживается — не страшно, спасает ручной бэкап
  }
  return profile
}

export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  await db.profile.update(1, patch)
}

/** Ручная правка нормы отключает авторасчёт: пользователь знает лучше формулы */
export async function setManualTargets(targets: Nutrients): Promise<void> {
  await db.profile.update(1, { targets, targetsManual: true })
}

export async function resetToAutoTargets(weightKg: number): Promise<Nutrients | null> {
  const profile = await getProfile()
  if (!profile) return null
  const { targets } = calcTargets({
    sex: profile.sex,
    birthDate: profile.birthDate,
    heightCm: profile.heightCm,
    weightKg,
    activity: profile.activity,
    goal: profile.goal,
    ratePerWeek: profile.ratePerWeek,
  })
  // Вода тоже идёт от веса: раньше она считалась один раз в онбординге
  // и дальше жила своей жизнью
  await db.profile.update(1, {
    targets, targetsManual: false, waterGoalMl: Math.round(weightKg * 30),
  })
  return targets
}

/** Стереть всё: базу, тему, регистрацию воркера. Назад дороги нет. */
export async function wipeEverything(): Promise<void> {
  await db.delete()
  try { localStorage.clear() } catch { /* приватный режим */ }
  const regs = await navigator.serviceWorker?.getRegistrations?.() ?? []
  await Promise.all(regs.map((r) => r.unregister()))
}
