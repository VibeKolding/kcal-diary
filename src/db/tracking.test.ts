import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addWater, getWater, putWeight, weightsForRange, weightHistory } from './tracking'

describe('вода и вес', () => {
  beforeEach(async () => {
    await Promise.all([db.weights.clear(), db.water.clear()])
  })

  /* Три касания в одном такте раньше давали 250 мл вместо 750 */
  it('быстрые нажатия «+250» не теряют стаканы', async () => {
    await Promise.all([addWater(250, '2026-09-20'), addWater(250, '2026-09-20'), addWater(250, '2026-09-20')])
    expect(await getWater('2026-09-20')).toBe(750)
  })

  it('вода не уходит в минус', async () => {
    await addWater(250, '2026-09-19')
    await addWater(-1000, '2026-09-19')
    expect(await getWater('2026-09-19')).toBe(0)
  })

  it('вес за отрезок берётся по датам, а не по числу записей', async () => {
    await putWeight({ date: '2026-03-01', kg: 90 })
    await putWeight({ date: '2026-09-13', kg: 82 })
    await putWeight({ date: '2026-09-18', kg: 81.5 })
    await putWeight({ date: '2026-09-19', kg: 81 })

    const week = await weightsForRange('2026-09-13', '2026-09-19')
    expect(week.map((w) => w.date)).toEqual(['2026-09-13', '2026-09-18', '2026-09-19'])

    // Старый способ отдавал последние N записей независимо от дат
    const byCount = await weightHistory(7)
    expect(byCount).toHaveLength(4)
  })
})
