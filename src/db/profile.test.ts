import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { resetToAutoTargets, syncAutoTargets } from './profile'
import { putWeight } from './tracking'
import { birthDateFromAge, calcTargets } from '@/domain/targets'
import type { Profile } from '@/domain/types'

/*
 * Пересчёт после взвешивания идёт мимо анкеты: профиль мог прийти из
 * старой версии или копии, а вес — опуститься уже после анкеты. Пределы
 * снижения должны действовать и здесь, а сама анкета — остаться как была.
 */
describe('пересчёт нормы по весу', () => {
  const profile: Profile = {
    id: 1, sex: 'female', birthDate: birthDateFromAge(30), heightCm: 165,
    activity: 'light', goal: 'lose', ratePerWeek: 1,
    targets: { kcal: 1500, protein: 120, fat: 50, carbs: 150 }, targetsManual: false,
    theme: 'dark', waterGoalMl: 2000, createdAt: 1,
  }

  beforeEach(async () => {
    await db.profile.clear()
  })

  it('при недостатке веса ставит норму удержания, анкету не трогает', async () => {
    await db.profile.put(profile)
    // 45 кг при 165 см — ИМТ 16,5
    const targets = await resetToAutoTargets(45)
    const keep = calcTargets({ ...profile, weightKg: 45, goal: 'keep', ratePerWeek: 0 })
    expect(targets).toEqual(keep.targets)

    const saved = await db.profile.get(1)
    expect(saved?.targets).toEqual(keep.targets)
    expect(saved?.goal).toBe('lose')
    expect(saved?.ratePerWeek).toBe(1)
  })

  it('подростку урезает темп до 0,25 кг в неделю', async () => {
    const teen = { ...profile, sex: 'male' as const, birthDate: birthDateFromAge(16), heightCm: 175 }
    await db.profile.put(teen)
    const targets = await resetToAutoTargets(70)
    expect(targets).toEqual(calcTargets({ ...teen, weightKg: 70, ratePerWeek: 0.25 }).targets)
  })
})

/*
 * Норма хранится готовыми числами, и профиль, посчитанный прежней версией
 * без пределов, жил бы со старым дефицитом до следующего взвешивания.
 * Сверка при запуске ставит его на норму, которую описывает сводка анкеты.
 */
describe('сверка авторасчётной нормы', () => {
  // Женщина 30 лет, 165 см, «Снизить вес» по килограмму — и норма с
  // дефицитом, которую посчитала версия без пределов
  const legacy: Profile = {
    id: 1, sex: 'female', birthDate: birthDateFromAge(30), heightCm: 165,
    activity: 'light', goal: 'lose', ratePerWeek: 1,
    targets: { kcal: 1180, protein: 90, fat: 40, carbs: 115 }, targetsManual: false,
    theme: 'dark', waterGoalMl: 1700, createdAt: 1,
  }

  beforeEach(async () => {
    await Promise.all([db.profile.clear(), db.weights.clear()])
  })

  it('при недостатке веса ставит норму удержания, анкету и воду не трогает', async () => {
    await db.profile.put(legacy)
    // 45 кг при 165 см — ИМТ 16,5
    await putWeight({ date: '2026-09-20', kg: 45 })

    expect(await syncAutoTargets()).toBe(true)
    const saved = await db.profile.get(1)
    const keep = calcTargets({ ...legacy, weightKg: 45, goal: 'keep', ratePerWeek: 0 })
    expect(saved?.targets).toEqual(keep.targets)
    expect(saved?.goal).toBe('lose')
    expect(saved?.ratePerWeek).toBe(1)
    expect(saved?.targetsManual).toBe(false)
    // Воду можно задать руками, а флага для неё нет — сверка её не касается
    expect(saved?.waterGoalMl).toBe(1700)

    // Второй раз сверять нечего
    expect(await syncAutoTargets()).toBe(false)
  })

  it('берёт последнее взвешивание', async () => {
    await db.profile.put(legacy)
    await putWeight({ date: '2026-09-01', kg: 70 })
    await putWeight({ date: '2026-09-20', kg: 45 })
    await syncAutoTargets()
    const keep = calcTargets({ ...legacy, weightKg: 45, goal: 'keep', ratePerWeek: 0 })
    expect((await db.profile.get(1))?.targets).toEqual(keep.targets)
  })

  it('подростку урезает темп до 0,25, а в 18 лет возвращает выбранный', async () => {
    // 18 лет исполняется 1 октября 2026
    const teen = { ...legacy, sex: 'male' as const, birthDate: '2008-10-01', heightCm: 175 }
    await db.profile.put(teen)
    await putWeight({ date: '2026-09-20', kg: 70 })

    const before = new Date(2026, 8, 30, 12)
    expect(await syncAutoTargets(before)).toBe(true)
    expect((await db.profile.get(1))?.targets)
      .toEqual(calcTargets({ ...teen, weightKg: 70, ratePerWeek: 0.25 }, before).targets)

    // Наутро после дня рождения — взрослый потолок: 1 % от 70 кг
    const after = new Date(2026, 9, 1, 8)
    expect(await syncAutoTargets(after)).toBe(true)
    expect((await db.profile.get(1))?.targets)
      .toEqual(calcTargets({ ...teen, weightKg: 70, ratePerWeek: 0.7 }, after).targets)
  })

  it('ручную норму не трогает', async () => {
    await db.profile.put({ ...legacy, targetsManual: true })
    await putWeight({ date: '2026-09-20', kg: 45 })
    expect(await syncAutoTargets()).toBe(false)
    expect((await db.profile.get(1))?.targets).toEqual(legacy.targets)
  })

  it('без взвешиваний норму не трогает: считать не от чего', async () => {
    await db.profile.put(legacy)
    expect(await syncAutoTargets()).toBe(false)
    expect((await db.profile.get(1))?.targets).toEqual(legacy.targets)
  })

  it('без профиля ничего не делает', async () => {
    expect(await syncAutoTargets()).toBe(false)
    expect(await db.profile.count()).toBe(0)
  })
})
