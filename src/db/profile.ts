import type { Nutrients, Profile } from '@/domain/types'
import { calcTargets, targetsForProfile, waterGoalFor, type TargetInput } from '@/domain/targets'
import { db, setMeta, META } from './db'
import { latestWeight, putWeight } from './tracking'
import { ensurePersistentStorage } from './persist'
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

  // Данные появились — самое время повторить просьбу не вытеснять их.
  // Через ensurePersistentStorage, а не голым persist(): просить можно
  // только у установленного приложения, во вкладке часть браузеров
  // показала бы окно разрешения на пустом месте (см. persist.ts).
  // Без await: ответа браузера не ждёт ни анкета, ни ручная норма после неё.
  void ensurePersistentStorage().catch(() => undefined)
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
  const { targets } = targetsForProfile(profile, weightKg)
  // Вода тоже идёт от веса: раньше она считалась один раз в онбординге
  // и дальше жила своей жизнью
  await db.profile.update(1, {
    targets, targetsManual: false, waterGoalMl: waterGoalFor(weightKg),
  })
  return targets
}

/**
 * Сверить сохранённую авторасчётную норму с формулой и поправить, если
 * разошлась. true — норма переписана.
 *
 * Норма хранится готовыми числами, а пересчитывается только по поводу:
 * взвешивание, сохранение анкеты, «Вернуть авторасчёт». Но план, по
 * которому она считается (safePlan), зависит ещё и от возраста, а профиль
 * бывает посчитан другой версией приложения — старый дневник или копия из
 * файла. Без сверки такой профиль жил бы со старым дефицитом до следующего
 * взвешивания: подросток или человек с ИМТ ниже 18,5 видел бы на «Сегодня»
 * норму на снижение, а в анкете — что снижение приостановлено. Поэтому
 * сверка идёт при запуске, со сменой дня (исполнилось 18) и после
 * восстановления из копии.
 *
 * Трогает только калории и БЖУ. Ручную норму не трогает — это выбор
 * человека. Воду тоже: её можно поставить руками, а флага «вода вручную»
 * нет, и сверка при каждом запуске стирала бы её молча. Без взвешиваний
 * считать не от чего — норма остаётся как есть.
 *
 * Внутри транзакции импорта ждёт только запросов к базе, так что её можно
 * звать и оттуда.
 */
export async function syncAutoTargets(now = new Date()): Promise<boolean> {
  const profile = await getProfile()
  if (!profile || profile.targetsManual) return false
  const w = await latestWeight()
  if (!w) return false
  const { targets } = targetsForProfile(profile, w.kg, now)
  if (sameNutrients(targets, profile.targets)) return false
  await db.profile.update(1, { targets })
  return true
}

function sameNutrients(a: Nutrients, b: Nutrients): boolean {
  return a.kcal === b.kcal && a.protein === b.protein && a.fat === b.fat && a.carbs === b.carbs
}

/** Стереть всё: базу, тему, регистрацию воркера. Назад дороги нет. */
export async function wipeEverything(): Promise<void> {
  await db.delete()
  try { localStorage.clear() } catch { /* приватный режим */ }
  const regs = await navigator.serviceWorker?.getRegistrations?.() ?? []
  await Promise.all(regs.map((r) => r.unregister()))
}
