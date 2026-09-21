import * as THREE from 'three'
import { leafAxis, leafOutline, leafVeins, VEIN, type Pt } from '@/ui/leaf'

/**
 * Объёмный лист со сквозными прорезями прожилок.
 *
 * Своя сборка вместо ExtrudeGeometry, по трём причинам.
 *
 * 1. ExtrudeGeometry скругляет все контуры одинаково. Скругление края
 *    листа — 1,4 единицы, а прорезь шириной в единицу такое скругление
 *    просто закрыло бы: грань прорези ушла бы сама в себя.
 * 2. У неё нормали по граням, а не по вершинам: на скруглении видны
 *    полосы, а стекло с отражениями делает их особенно заметными.
 * 3. Прежний лист переворачивался по y уже после выдавливания, и порядок
 *    обхода треугольников становился обратным: к камере смотрела изнанка,
 *    и было видно заднюю грань листа изнутри.
 *
 * Здесь каждый контур — край листа и каждая прорезь — обходится кольцами
 * по своему профилю, и нормаль у каждой вершины берётся из профиля, а не
 * из треугольника. Координаты сцены: центр поля в нуле, y вверх, лист
 * симметричен по толщине относительно z = 0.
 */

/** Профиль кромки: скругление от лицевой грани до прямого торца */
interface Profile {
  /** На сколько торец выходит за контур лицевой грани */
  size: number
  /** Высота скругления по толщине */
  height: number
  steps: number
}

/** Края листа: торец выходит за контур, как у прежнего листа */
const EDGE: Profile = { size: 1.4, height: 1.4, steps: 8 }
/**
 * Кромки прорезей. У поверхности прорезь шире просвета на скругление,
 * в глубине — ровно просвет. Скругление маленькое: большое съело бы
 * перемычки между прожилками.
 */
const CUT: Profile = { size: VEIN.fillet, height: 0.3, steps: 4 }
/** Прямая часть торца листа, между двумя скруглениями */
const WALL = 0.4

/** Половина толщины листа */
export const LEAF_HALF_DEPTH = WALL / 2 + EDGE.height

/**
 * Излом по центральной прожилке, градусы: половинки листа отходят назад,
 * как скаты крыши. Живой лист никогда не бывает плоским, а у плоского
 * обе половины ловят свет одинаково, и он читается штампованной пластинкой.
 * Сильнее 8° верхняя половина ловит отражение целиком и белеет, а прорези
 * на ней теряются.
 */
const FOLD_DEG = 8
/** Радиус скругления гребня: иначе у основания и кончика он был бы ребром */
const FOLD_ROUND = 1.2

interface Ring {
  /** Сдвиг от контура наружу из материала */
  o: number
  z: number
  /** Нормаль профиля: вдоль сдвига и вдоль z */
  a: number
  b: number
}

/**
 * Кольца профиля от лицевой грани через торец к тыльной.
 * `shift` сдвигает весь профиль: у прорезей торец стоит ровно на
 * просвете, а у поверхности кромка отступает внутрь материала.
 */
function rings(p: Profile, shift: number): Ring[] {
  const straightTop = LEAF_HALF_DEPTH - p.height
  const front: Ring[] = []
  for (let k = 0; k <= p.steps; k++) {
    const phi = (k / p.steps) * (Math.PI / 2)
    const a = p.height * Math.sin(phi)
    const b = p.size * Math.cos(phi)
    const l = Math.sqrt(a * a + b * b)
    front.push({ o: shift + p.size * Math.sin(phi), z: straightTop + p.height * Math.cos(phi), a: a / l, b: b / l })
  }
  const back = [...front].reverse().map((r) => ({ ...r, z: -r.z, b: -r.b }))
  return [...front, ...back]
}

/** Поле 100×100 с y вниз → сцена с центром в нуле и y вверх */
const toScene = (p: Pt): Pt => [p[0] - 50, 50 - p[1]]

function signedArea(poly: Pt[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

/** Контур в сцене нужного обхода: край листа против часовой, прорези по часовой */
function oriented(poly: Pt[], ccw: boolean): Pt[] {
  const out = poly.map(toScene)
  return (signedArea(out) > 0) === ccw ? out : out.reverse()
}

/**
 * Нормали контура наружу из материала. При обходе края против часовой
 * и прорезей по часовой это одна и та же формула: у края она смотрит
 * наружу листа, у прорези — внутрь прорези.
 */
function normals(poly: Pt[]): Pt[] {
  return poly.map((_, i) => {
    const a = poly[(i - 1 + poly.length) % poly.length]!
    const b = poly[(i + 1) % poly.length]!
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const l = Math.sqrt(dx * dx + dy * dy) || 1
    return [dy / l, -dx / l] as Pt
  })
}

/** Контур, сдвинутый по нормалям: так получается каждое кольцо кромки */
const shifted = (poly: Pt[], n: Pt[], o: number): Pt[] =>
  poly.map((p, i) => [p[0] + n[i]![0] * o, p[1] + n[i]![1] * o] as Pt)

/**
 * Излом: каждая точка уходит назад пропорционально расстоянию от оси, а
 * нормаль поворачивается вместе с поверхностью. Толщина та же, торцы
 * остаются отвесными — сдвиг только по z.
 */
function fold(pos: Float32Array, nrm: Float32Array | null) {
  const k = Math.tan((FOLD_DEG * Math.PI) / 180)
  const [a0, a1] = leafAxis().map(toScene) as [Pt, Pt]
  const ux = a1[0] - a0[0], uy = a1[1] - a0[1]
  const ul = Math.sqrt(ux * ux + uy * uy)
  const nx = -uy / ul, ny = ux / ul
  for (let i = 0; i < pos.length; i += 3) {
    const d = (pos[i]! - a0[0]) * nx + (pos[i + 1]! - a0[1]) * ny
    const q = Math.sqrt(d * d + FOLD_ROUND * FOLD_ROUND)
    pos[i + 2] = pos[i + 2]! - k * (q - FOLD_ROUND)
    if (!nrm) continue
    // Наклон поверхности поперёк оси. При сдвиге по z нормаль меняется
    // обратной транспонированной матрицей сдвига: z-составляющая та же
    const g = -k * (d / q)
    const vx = nrm[i]! - g * nx * nrm[i + 2]!, vy = nrm[i + 1]! - g * ny * nrm[i + 2]!, vz = nrm[i + 2]!
    const l = Math.sqrt(vx * vx + vy * vy + vz * vz)
    nrm[i] = vx / l; nrm[i + 1] = vy / l; nrm[i + 2] = vz / l
  }
}

/**
 * Геометрия листа: группа 0 — лицевые грани, скругление и торец края,
 * группа 1 — кромки и стенки прорезей.
 *
 * Массивы выделяются сразу под итоговый размер: вершин около тридцати
 * тысяч, и наращивание обычных массивов по одной было втрое дольше —
 * а сборка идёт на заставке, в главном потоке.
 */
export function createLeafGeometry(): THREE.BufferGeometry {
  const outer = oriented(leafOutline(), true)
  const cuts = leafVeins().map((v) => oriented(v, false))
  const outerN = normals(outer)
  const cutN = cuts.map(normals)
  const edgeRings = rings(EDGE, 0)
  const cutRings = rings(CUT, -CUT.size)

  // Лицевая и тыльная грани: контур края с дырами прорезей. Контуры у
  // них совпадают — кольца профиля симметричны, — поэтому разбиение на
  // треугольники одно на обе.
  const contour = shifted(outer, outerN, edgeRings[0]!.o)
  const holes = cuts.map((c, k) => shifted(c, cutN[k]!, cutRings[0]!.o))
  const flat = [contour, ...holes].flat()
  const tris = THREE.ShapeUtils.triangulateShape(
    contour.map((p) => new THREE.Vector2(p[0], p[1])),
    holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1]))),
  ) as [number, number, number][]

  const cutPoints = cuts.reduce((s, c) => s + c.length, 0)
  const vertexCount = outer.length * edgeRings.length + cutPoints * cutRings.length + 2 * flat.length
  const faceCount = outer.length * (edgeRings.length - 1) * 6 + tris.length * 6
  const wallCount = cutPoints * (cutRings.length - 1) * 6
  const pos = new Float32Array(vertexCount * 3)
  const nrm = new Float32Array(vertexCount * 3)
  const index = new Uint32Array(faceCount + wallCount)
  let v = 0
  let f = 0            // запись в группу 0
  let w = faceCount    // запись в группу 1

  const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z
    nrm[v * 3] = nx / l; nrm[v * 3 + 1] = ny / l; nrm[v * 3 + 2] = nz / l
    return v++
  }

  /** Обход контура кольцами профиля */
  const sweep = (poly: Pt[], n: Pt[], profile: Ring[], group: 0 | 1) => {
    const m = poly.length
    const base = v
    for (const r of profile) {
      for (let i = 0; i < m; i++) {
        const p = poly[i]!, q = n[i]!
        vertex(p[0] + q[0] * r.o, p[1] + q[1] * r.o, r.z, q[0] * r.a, q[1] * r.a, r.b)
      }
    }
    for (let r = 0; r < profile.length - 1; r++) {
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m
        const A = base + r * m + i, B = base + r * m + j
        const C = base + (r + 1) * m + j, D = base + (r + 1) * m + i
        if (group === 0) {
          index[f++] = A; index[f++] = C; index[f++] = B; index[f++] = A; index[f++] = D; index[f++] = C
        } else {
          index[w++] = A; index[w++] = C; index[w++] = B; index[w++] = A; index[w++] = D; index[w++] = C
        }
      }
    }
  }

  sweep(outer, outerN, edgeRings, 0)
  cuts.forEach((c, k) => sweep(c, cutN[k]!, cutRings, 1))

  for (const sign of [1, -1] as const) {
    const base = v
    for (const p of flat) vertex(p[0], p[1], sign * LEAF_HALF_DEPTH, 0, 0, sign)
    for (const [a, b, c] of tris) {
      const pa = flat[a]!, pb = flat[b]!, pc = flat[c]!
      const z = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])
      // Обход против часовой смотрит на +z: лицевой грани он и нужен
      const ccw = (z > 0) === (sign > 0)
      index[f++] = base + a
      index[f++] = base + (ccw ? b : c)
      index[f++] = base + (ccw ? c : b)
    }
  }

  fold(pos, nrm)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  geo.addGroup(0, faceCount, 0)
  geo.addGroup(faceCount, wallCount, 1)
  geo.computeBoundingSphere()
  return geo
}

/**
 * Плоская заглушка по контуру листа — для маски глубины за ним.
 *
 * Свечение знака лежит позади листа, и без неё прорези показывали бы не
 * фон, а золотое пятно: щель читалась золотой щербиной. Эта фигура пишет
 * только глубину, и свечение за листом не рисуется вовсе.
 */
export function createLeafShadowGeometry(): THREE.BufferGeometry {
  const outer = oriented(leafOutline(), true)
  const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p[0], p[1])))
  const geo = new THREE.ShapeGeometry(shape, 1)
  geo.translate(0, 0, -LEAF_HALF_DEPTH - 0.05)
  // Излом тот же, что у листа: иначе у краёв лист уходил бы за маску
  fold(geo.attributes.position!.array as Float32Array, null)
  return geo
}
