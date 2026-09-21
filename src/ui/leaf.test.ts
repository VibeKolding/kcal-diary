import { describe, expect, it } from 'vitest'
import { LEAF_PATH, VEIN, distToOutline, insideLeaf, leafAxis, leafOutline, leafVeins, veinCenters, veinsPath, type Pt } from './leaf'

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t)
}

function distToPolygon(p: Pt, poly: Pt[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) best = Math.min(best, distToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!))
  return best
}

function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** Пересекаются ли отрезки ab и cd во внутренних точках */
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

describe('лист эмблемы', () => {
  it('контур тот же, что у знака: M36 64c0-15 10-26 28-30 2 17-6 30-20 33-4 1-8-1-8-3Z', () => {
    // Путь записан в абсолютных координатах; это тот же лист, что был
    // в относительных. Сверяем опорные точки, а не строку.
    expect(LEAF_PATH).toBe('M36 64C36 49 46 38 64 34C66 51 58 64 44 67C40 68 36 66 36 64Z')
    const outline = leafOutline()
    for (const p of [[36, 64], [44, 67]] as Pt[]) expect(distToPolygon(p, outline)).toBeLessThan(0.05)
    // Кончик скруглён, но меньше чем на пиксель знака
    expect(distToPolygon([64, 34], outline)).toBeLessThan(0.4)
  })

  it('ось идёт от середины основания к кончику', () => {
    const [base, tip] = leafAxis()
    expect(distToOutline(base)).toBeLessThan(0.05)
    expect(tip).toEqual([64, 34])
  })

  const veins = leafVeins()
  const surface = leafVeins(VEIN.fillet)

  it('центральная прожилка и по шесть боковых с каждой стороны', () => {
    expect(veins).toHaveLength(13)
    const [base, tip] = leafAxis()
    const side = (poly: Pt[]) => {
      const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0])
      return Math.sign((tip[0] - base[0]) * (c[1] - base[1]) - (tip[1] - base[1]) * (c[0] - base[0]))
    }
    const sides = veins.slice(1).map(side)
    expect(sides.filter((s) => s > 0)).toHaveLength(6)
    expect(sides.filter((s) => s < 0)).toHaveLength(6)
  })

  /*
   * Прорезь, дошедшая до края, разрезает лист: край перестаёт быть
   * замкнутым, и знак читается рваным. Запас считается у поверхности,
   * где прорезь шире на скругление кромки.
   */
  it('ни одна прорезь не подходит к краю листа', () => {
    for (const poly of surface) {
      for (const p of poly) {
        expect(insideLeaf(p)).toBe(true)
        expect(distToOutline(p)).toBeGreaterThan(VEIN.margin - VEIN.fillet - 0.01)
      }
    }
  })

  /*
   * Перемычка должна пережить скругление кромки: у поверхности прорези
   * шире, и две соседние могли бы там слиться. Тогда лицевая грань
   * получила бы пересекающиеся дыры, и разбиение на треугольники
   * развалилось бы.
   */
  it('прорези не сливаются даже у поверхности', () => {
    let closest = Infinity
    for (let i = 0; i < surface.length; i++) {
      for (let j = i + 1; j < surface.length; j++) {
        for (const p of surface[i]!) closest = Math.min(closest, distToPolygon(p, surface[j]!))
      }
    }
    expect(closest).toBeGreaterThan(0.3)
  })

  it('контур каждой прорези не пересекает сам себя', () => {
    for (const poly of surface) {
      const n = poly.length
      for (let i = 0; i < n; i++) {
        for (let j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue
          expect(crosses(poly[i]!, poly[(i + 1) % n]!, poly[j]!, poly[(j + 1) % n]!)).toBe(false)
        }
      }
    }
  })

  /*
   * Насквозь видно только просвет. Если он уже пары точек экрана, щель
   * перестаёт быть прорезью и читается царапиной. На знаке в 224 точки
   * единица поля — около двух точек.
   */
  it('просвет у корня прожилки не уже 0,7 единицы', () => {
    expect(VEIN.midrib[0] * 2).toBeGreaterThanOrEqual(0.7)
    expect(VEIN.lateral[0] * 2).toBeGreaterThanOrEqual(0.7)
    // И сама прорезь такой ширины: у корня её средняя линия отстоит от
    // обоих краёв больше чем на четверть единицы
    const roots = veinCenters(0.2)
    veins.forEach((poly, i) => {
      expect(inside(roots[i]!, poly)).toBe(true)
      expect(distToPolygon(roots[i]!, poly)).toBeGreaterThan(0.28)
    })
  })

  it('маска плоского знака: все прорези, гладкими кривыми, в пределах десяти килобайт', () => {
    const d = veinsPath()
    expect(d.match(/M/g)).toHaveLength(13)
    expect(d.match(/Z/g)).toHaveLength(13)
    expect(d).toMatch(/^[MQZ0-9. -]+$/)
    expect(d.length).toBeLessThan(10 * 1024)
  })
})
