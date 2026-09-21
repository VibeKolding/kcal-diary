import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { veinCenters, type Pt } from '@/ui/leaf'
import { LEAF_HALF_DEPTH, createLeafGeometry, createLeafShadowGeometry } from './leafGeometry'

const geo = createLeafGeometry()
const pos = geo.attributes.position!
const nrm = geo.attributes.normal!
const index = geo.index!

function triangle(i: number) {
  const a = new THREE.Vector3().fromBufferAttribute(pos, index.getX(i))
  const b = new THREE.Vector3().fromBufferAttribute(pos, index.getX(i + 1))
  const c = new THREE.Vector3().fromBufferAttribute(pos, index.getX(i + 2))
  const n = new THREE.Vector3()
    .fromBufferAttribute(nrm, index.getX(i))
    .add(new THREE.Vector3().fromBufferAttribute(nrm, index.getX(i + 1)))
    .add(new THREE.Vector3().fromBufferAttribute(nrm, index.getX(i + 2)))
  const face = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
  return { a, b, c, n, face }
}

describe('объёмный лист', () => {
  it('две группы граней покрывают все треугольники', () => {
    expect(geo.groups).toHaveLength(2)
    const [faces, cuts] = geo.groups as [THREE.GeometryGroup, THREE.GeometryGroup]
    expect(faces.start).toBe(0)
    expect(cuts.start).toBe(faces.count)
    expect(faces.count + cuts.count).toBe(index.count)
    expect(cuts.materialIndex).toBe(1)
  })

  it('в координатах нет пропусков', () => {
    expect(Array.from(pos.array).every(Number.isFinite)).toBe(true)
    expect(Array.from(nrm.array).every(Number.isFinite)).toBe(true)
  })

  /*
   * Прежний лист собирался наизнанку: его переворачивали по y уже после
   * выдавливания, и порядок обхода становился обратным. Камера видела
   * заднюю грань изнутри, и скругления читались вогнутыми.
   *
   * Проверка по площади, а не по штукам: излом наклоняет несколько
   * вытянутых в нитку треугольников лицевой грани, и их собственная
   * нормаль ложится почти горизонтально. Свет берёт нормали вершин, а на
   * экране такие нитки меньше точки.
   */
  it('грани смотрят наружу', () => {
    let total = 0, wrong = 0
    for (let i = 0; i < index.count; i += 3) {
      const { n, face } = triangle(i)
      const area = face.length() / 2
      total += area
      if (face.dot(n) <= 0) wrong += area
    }
    expect(wrong / total).toBeLessThan(1e-4)
  })

  it('лицевая грань обращена к камере', () => {
    let front = 0
    for (let i = 0; i < index.count; i += 3) {
      const { a, b, c, n, face } = triangle(i)
      if (Math.min(a.z, b.z, c.z) > 0 && n.z > 2.9) {
        front++
        expect(face.z).toBeGreaterThan(0)
      }
    }
    expect(front).toBeGreaterThan(1000)
  })

  it('толщина листа: около трёх единиц, половинки отходят назад', () => {
    geo.computeBoundingBox()
    const box = geo.boundingBox!
    expect(box.max.z).toBeCloseTo(LEAF_HALF_DEPTH, 1)
    expect(box.min.z).toBeLessThan(-LEAF_HALF_DEPTH)
    expect(box.min.z).toBeGreaterThan(-LEAF_HALF_DEPTH - 2)
  })

  /*
   * Главное: сквозь прорезь действительно видно. Берём точку в глубине
   * каждой прорези и убеждаемся, что её не накрывает ни один треугольник
   * листа, если смотреть спереди.
   */
  it('прорези сквозные', () => {
    const probes = [...veinCenters(0.2), ...veinCenters(0.5)].map((p): Pt => [p[0] - 50, 50 - p[1]])
    const P = pos.array as Float32Array
    const I = index.array as Uint32Array
    const covers = (p: Pt, i: number) => {
      const ax = P[I[i]! * 3]!, ay = P[I[i]! * 3 + 1]!
      const bx = P[I[i + 1]! * 3]!, by = P[I[i + 1]! * 3 + 1]!
      const cx = P[I[i + 2]! * 3]!, cy = P[I[i + 2]! * 3 + 1]!
      // Стенка, стоящая ребром к камере, ничего не закрывает
      if (Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) < 1e-9) return false
      const d1 = (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax)
      const d2 = (cx - bx) * (p[1] - by) - (cy - by) * (p[0] - bx)
      const d3 = (ax - cx) * (p[1] - cy) - (ay - cy) * (p[0] - cx)
      return (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)
    }
    for (const p of probes) {
      let covered = 0
      for (let i = 0; i < I.length; i += 3) if (covers(p, i)) covered++
      expect(covered).toBe(0)
    }
  })

  it('маска глубины лежит позади листа', () => {
    const shadow = createLeafShadowGeometry()
    const z = shadow.attributes.position!
    for (let i = 0; i < z.count; i++) expect(z.getZ(i)).toBeLessThan(-LEAF_HALF_DEPTH)
  })
})
