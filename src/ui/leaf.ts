/**
 * Лист эмблемы: контур и сквозные прорези прожилок.
 *
 * Координаты — в поле знака 100×100, y вниз, как в SVG. Отсюда форму берут
 * и объёмный знак заставки (геометрией), и плоская заглушка (маской), поэтому
 * прорези у них не могут разойтись.
 *
 * Здесь нет ни three, ни DOM: только точки. Модуль попадает в основной
 * бандл вместе с плоским знаком, а считает прорези лишь тот, кто их просит.
 */

export type Pt = readonly [number, number]

type Cubic = readonly [Pt, Pt, Pt, Pt]

/** Контур листа: три кубических сегмента, от основания к кончику и обратно */
const CURVES: readonly Cubic[] = [
  [[36, 64], [36, 49], [46, 38], [64, 34]], // верхний край, к кончику
  [[64, 34], [66, 51], [58, 64], [44, 67]], // нижний край, от кончика
  [[44, 67], [40, 68], [36, 66], [36, 64]], // скруглённое основание
]

const fmt = (p: Pt) => `${p[0]} ${p[1]}`

/** Тот же контур строкой SVG — для плоского знака */
export const LEAF_PATH = `M${fmt(CURVES[0]![0])}`
  + CURVES.map((c) => `C${fmt(c[1])} ${fmt(c[2])} ${fmt(c[3])}`).join('') + 'Z'

/**
 * Размеры прорезей в единицах поля.
 *
 * Прорезь задана своим просветом — самой узкой частью, через которую
 * видно фон. У поверхности объёмного листа кромка скруглена, и там
 * прорезь шире на `fillet` с каждой стороны.
 */
export const VEIN = {
  /** Скругление кромки прорези у поверхности листа */
  fillet: 0.25,
  /** Полуширина центральной прожилки у основания и у конца */
  midrib: [0.62, 0.14],
  /** Полуширина боковой прожилки у корня и у конца */
  lateral: [0.38, 0.07],
  /** Перемычка между боковой прожилкой и центральной */
  bridge: 0.95,
  /** Сколько цельного листа оставить от конца прорези до края */
  margin: 1.5,
} as const

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k]
const len = (a: Pt) => Math.sqrt(a[0] * a[0] + a[1] * a[1])
const unit = (a: Pt): Pt => { const l = len(a) || 1; return [a[0] / l, a[1] / l] }

function cubicAt(c: Cubic, t: number): Pt {
  const m = 1 - t
  const a = m * m * m, b = 3 * m * m * t, d = 3 * m * t * t, e = t * t * t
  return [
    a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0],
    a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1],
  ]
}

/** Кривая, разбитая на отрезки длиной около `step` */
function sampleCubic(c: Cubic, step: number): Pt[] {
  const fine: Pt[] = []
  for (let i = 0; i <= 400; i++) fine.push(cubicAt(c, i / 400))
  const out: Pt[] = [fine[0]!]
  let acc = 0
  for (let i = 1; i < fine.length; i++) {
    acc += len(sub(fine[i]!, fine[i - 1]!))
    if (acc >= step) { out.push(fine[i]!); acc = 0 }
  }
  const last = fine[fine.length - 1]!
  if (len(sub(out[out.length - 1]!, last)) < step * 0.4) out.pop()
  out.push(last)
  return out
}

/** Точка на ломаной на заданном расстоянии от её начала */
function alongPolyline(poly: Pt[], dist: number): { p: Pt; i: number } {
  let acc = 0
  for (let i = 1; i < poly.length; i++) {
    const seg = len(sub(poly[i]!, poly[i - 1]!))
    if (acc + seg >= dist) return { p: lerp(poly[i - 1]!, poly[i]!, (dist - acc) / seg), i }
    acc += seg
  }
  return { p: poly[poly.length - 1]!, i: poly.length - 1 }
}

let outlineCache: Pt[] | null = null

/**
 * Контур листа замкнутой ломаной, без повтора первой точки.
 *
 * Кончик скруглён на полединицы. Острый угол нельзя раздать в стороны
 * ровным скруглением кромки: грань либо сломается, либо вытянется иглой.
 * Разница с исходным путём у кончика меньше пикселя.
 */
export function leafOutline(): Pt[] {
  if (outlineCache) return outlineCache
  const step = 0.2
  const [up, down, base] = CURVES.map((c) => sampleCubic(c, step)) as [Pt[], Pt[], Pt[]]
  const tip = up[up.length - 1]!
  const ROUND = 0.55
  const upRev = [...up].reverse()
  const a = alongPolyline(upRev, ROUND)
  const b = alongPolyline(down, ROUND)
  const arc: Pt[] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    arc.push(lerp(lerp(a.p, tip, t), lerp(tip, b.p, t), t))
  }
  const out = [
    ...up.slice(0, up.length - a.i),
    ...arc,
    ...down.slice(b.i),
    ...base.slice(1, -1),
  ]
  outlineCache = out
  return out
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a)
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)))
  return len(sub(p, add(a, ab, t)))
}

/** Расстояние от точки до контура листа */
export function distToOutline(p: Pt): number {
  const poly = leafOutline()
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, distToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!))
  }
  return best
}

/** Лежит ли точка внутри листа */
export function insideLeaf(p: Pt): boolean {
  const poly = leafOutline()
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/*
 * Ось листа: от середины основания к кончику. Лист почти симметричен
 * относительно неё — середина поперечника отходит от оси меньше чем на
 * половину единицы, — поэтому прожилки раскладываются в её координатах:
 * s вдоль оси, d поперёк, к нижнему краю положительно.
 */
const BASE: Pt = cubicAt(CURVES[2]!, 0.5)
const TIP: Pt = CURVES[0]![3]
const AXIS = sub(TIP, BASE)
const LENGTH = len(AXIS)
const U = unit(AXIS)
const N: Pt = [-U[1], U[0]]
const local = (s: number, d: number): Pt => add(add(BASE, U, s), N, d)

/** Ось листа: середина основания и кончик */
export const leafAxis = (): [Pt, Pt] => [BASE, TIP]

interface Stroke {
  /** Средняя линия: точка и единичная касательная при t ∈ [0, 1] */
  at: (t: number) => { p: Pt; tan: Pt }
  length: number
  /** Полуширина просвета при t ∈ [0, 1] */
  half: (t: number) => number
}

function quadStroke(a: Pt, c: Pt, b: Pt, half: (t: number) => number): Stroke {
  const at = (t: number) => {
    const p = lerp(lerp(a, c, t), lerp(c, b, t), t)
    const tan = unit(add(sub(c, a), sub(sub(b, c), sub(c, a)), t))
    return { p, tan }
  }
  let length = 0
  let prev = a
  for (let i = 1; i <= 64; i++) { const p = at(i / 64).p; length += len(sub(p, prev)); prev = p }
  return { at, length, half }
}

/** Сужение к концу: у корня прожилка держит ширину, к концу сходит на нет */
const taper = ([root, end]: readonly [number, number], power: number) =>
  (t: number) => end + (root - end) * Math.pow(1 - t, power)

/** Центральная прожилка: от основания почти до кончика, с лёгким изгибом */
function midrib(): Stroke {
  const s0 = LENGTH * 0.11
  const s1 = LENGTH * 0.88
  // Изгиб к нижнему краю: там же выгнута прожилка плоского знака, и там
  // проходит настоящая середина листа — она смещена от оси на 0,3–0,4.
  return quadStroke(local(s0, 0), local((s0 + s1) / 2, 0.7), local(s1, 0), taper(VEIN.midrib, 1))
}

/**
 * Боковые прожилки, попеременно с двух сторон, как у живого листа:
 * отходят от центральной под острым углом и загибаются к кончику.
 * Двенадцать — предел, при котором каждая прорезь ещё читается сквозной:
 * при четырнадцати щели становятся штриховкой и в светлой теме теряются.
 */
const LATERALS: readonly { t: number; side: 1 | -1 }[] = Array.from({ length: 12 }, (_, i) => ({
  t: 0.06 + (i * 0.8) / 12,
  side: i % 2 ? -1 : 1,
}))

/** Угол отхода боковой прожилки от центральной, градусы */
const LATERAL_ANGLE = 52

function lateral(mid: Stroke, t: number, side: 1 | -1): Stroke {
  const { p, tan } = mid.at(t)
  // Центральная идёт вдоль оси, поэтому её левая нормаль смотрит туда же,
  // куда N, — к нижнему краю
  const outward: Pt = [-tan[1] * side, tan[0] * side]
  const root = add(p, outward, mid.half(t) + VEIN.bridge + VEIN.lateral[0])
  const rad = (LATERAL_ANGLE * Math.PI) / 180
  const dir: Pt = unit(add([tan[0] * Math.cos(rad), tan[1] * Math.cos(rad)], outward, Math.sin(rad)))

  // Конец — там, где до края листа остаётся ровно margin: ищем вдоль
  // луча под средним углом, который чуть положе начального.
  const endRad = rad * 0.72
  const endDir = unit(add([tan[0] * Math.cos(endRad), tan[1] * Math.cos(endRad)], outward, Math.sin(endRad)))
  const want = VEIN.margin + VEIN.lateral[1]
  let lo = 0, hi = 30
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2
    const q = add(root, endDir, m)
    if (insideLeaf(q) && distToOutline(q) > want) lo = m
    else hi = m
  }
  const end = add(root, endDir, lo)
  const ctrl = add(root, dir, lo * 0.5)
  return quadStroke(root, ctrl, end, taper(VEIN.lateral, 1.3))
}

let strokesCache: Stroke[] | null = null

function strokes(): Stroke[] {
  if (strokesCache) return strokesCache
  const mid = midrib()
  strokesCache = [mid, ...LATERALS.map((l) => lateral(mid, l.t, l.side))]
  return strokesCache
}

/**
 * Точки на средних линиях прорезей: t = 0 — корень, 1 — конец. Там
 * насквозь видно наверняка, поэтому по ним проверяют, что прорези сквозные.
 */
export function veinCenters(t = 0.5): Pt[] {
  return strokes().map((st) => st.at(t).p)
}

/**
 * Шаг разбиения прорези. Объёмному листу нужна гладкая кромка — на экране
 * в три точки на пиксель единица поля занимает около шести точек, — а
 * плоскому знаку хватит и грубой: он меньше и показывается мгновение.
 */
const FINE = { side: 0.2, cap: 10 }
const COARSE = { side: 0.9, cap: 6 }

/**
 * Контур прорези: стороны — средняя линия, раздвинутая на полуширину,
 * концы — полуокружности. Число точек не зависит от `grow`: объёмный лист
 * строит кромку кольцами разной ширины и сшивает их точка к точке.
 */
function strokeOutline(st: Stroke, grow: number, step: typeof FINE): Pt[] {
  const sides = Math.max(8, Math.ceil(st.length / step.side))
  const left: Pt[] = [], right: Pt[] = []
  for (let i = 0; i <= sides; i++) {
    const t = i / sides
    const { p, tan } = st.at(t)
    const w = st.half(t) + grow
    const nl: Pt = [-tan[1], tan[0]]
    left.push(add(p, nl, w))
    right.push(add(p, nl, -w))
  }
  const cap = (t: number, from: 1 | -1): Pt[] => {
    const { p, tan } = st.at(t)
    const w = st.half(t) + grow
    const nl: Pt = [-tan[1], tan[0]]
    const fwd: Pt = t === 0 ? [-tan[0], -tan[1]] : tan
    const out: Pt[] = []
    for (let k = 1; k < step.cap; k++) {
      const a = (k / step.cap) * Math.PI
      // от одной стороны через «вперёд» к другой
      const c = Math.cos(a) * from, sn = Math.sin(a)
      out.push([p[0] + (nl[0] * c + fwd[0] * sn) * w, p[1] + (nl[1] * c + fwd[1] * sn) * w])
    }
    return out
  }
  return [...left, ...cap(1, 1), ...right.reverse(), ...cap(0, -1)]
}

/**
 * Прорези листа: по замкнутой ломаной на каждую, без повтора первой точки.
 * `grow` раздвигает все прорези разом: 0 — просвет, VEIN.fillet — ширина
 * у поверхности листа.
 */
export function leafVeins(grow = 0, coarse = false): Pt[][] {
  return strokes().map((st) => strokeOutline(st, grow, coarse ? COARSE : FINE))
}

const r1 = (v: number) => Math.round(v * 10) / 10
const mid = (a: Pt, b: Pt): Pt => [r1((a[0] + b[0]) / 2), r1((a[1] + b[1]) / 2)]

/**
 * Прорези строкой SVG — для маски плоского знака.
 *
 * Ломаная сглажена: каждая её вершина становится опорной точкой
 * квадратичной кривой между серединами соседних отрезков. Так хватает
 * редкой разбивки — строка в несколько килобайт, а не в тридцать, — и
 * кромка не идёт гранями.
 *
 * Ширина — просвет с небольшим запасом: у объёмного листа скругление
 * кромки тоже золотое, насквозь видно только просвет, и прорезь во всю
 * ширину скругления читалась бы на заглушке жирнее, чем на самом знаке.
 */
export function veinsPath(): string {
  return leafVeins(0.1, true)
    .map((poly) => {
      const n = poly.length
      let d = `M${mid(poly[n - 1]!, poly[0]!).join(' ')}`
      for (let i = 0; i < n; i++) {
        const p = poly[i]!
        d += `Q${r1(p[0])} ${r1(p[1])} ${mid(p, poly[(i + 1) % n]!).join(' ')}`
      }
      return d + 'Z'
    })
    .join('')
}
