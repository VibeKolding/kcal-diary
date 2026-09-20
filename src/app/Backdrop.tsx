import { useEffect, useRef } from 'react'
import s from './Backdrop.module.css'

/*
 * Живой фон: цветные пятна под всеми экранами, включая заставку.
 *
 * Рисуется на одном маленьком canvas (один пиксель на четыре экранных),
 * который браузер растягивает на весь экран — растяжение само даёт мягкость,
 * размытие не нужно. Под стеклом карточек (`backdrop-filter`) лежит один
 * неподвижный слой без фильтров: слоистый вариант с `filter: blur` и
 * анимацией transform заставлял стекло пересобирать фон и мерцать.
 *
 * Цвета — только из tokens.css (--glow-1…6), читаются при старте и при смене
 * темы. Геометрия и движение — здесь: дрейф по петле, дыхание и параллакс
 * от прокрутки (ближние пятна едут быстрее дальних).
 */

const SCALE = 4
const FPS = 30

interface Blob {
  cx: number; cy: number   // центр, доли экрана
  rx: number; ry: number   // полуоси, доли ширины и высоты экрана
  dx: number; dy: number   // амплитуда дрейфа, доли экрана
  period: number           // с, петля дрейфа
  breathe: number          // с, дыхание
  depth: number            // доля пути прокрутки
  phase: number
}

// Те же места, что были у radial-gradient на подложке 140 % экрана
const DARK: Blob[] = [
  { cx: 0.81, cy: -0.14, rx: 0.53, ry: 0.34, dx: 0.18, dy: 0.11, period: 11, breathe: 6,  depth: 0.05, phase: 0.0 },
  { cx: 0.02, cy: 0.14,  rx: 0.50, ry: 0.31, dx: -0.16, dy: 0.14, period: 14, breathe: 8, depth: 0.08, phase: 1.7 },
  { cx: 0.72, cy: 0.46,  rx: 0.70, ry: 0.43, dx: 0.22, dy: -0.14, period: 16, breathe: 10, depth: 0.11, phase: 3.1 },
  { cx: -0.09, cy: 0.64, rx: 0.62, ry: 0.38, dx: 0.14, dy: 0.16, period: 13, breathe: 7, depth: 0.07, phase: 4.4 },
  { cx: 0.61, cy: 1.12,  rx: 0.70, ry: 0.42, dx: -0.18, dy: -0.11, period: 15, breathe: 8, depth: 0.09, phase: 5.6 },
]
const LIGHT: Blob[] = [
  { cx: 0.00, cy: -0.23, rx: 0.70, ry: 0.42, dx: 0.18, dy: 0.11, period: 11, breathe: 6,  depth: 0.05, phase: 0.0 },
  { cx: -0.20, cy: 0.16, rx: 0.64, ry: 0.38, dx: -0.16, dy: 0.14, period: 14, breathe: 8, depth: 0.08, phase: 1.7 },
  { cx: 0.47, cy: 0.39,  rx: 0.73, ry: 0.45, dx: 0.22, dy: -0.14, period: 16, breathe: 10, depth: 0.11, phase: 3.1 },
  { cx: 1.14, cy: 0.61,  rx: 0.76, ry: 0.46, dx: 0.14, dy: 0.16, period: 13, breathe: 7, depth: 0.07, phase: 4.4 },
  { cx: 0.81, cy: 1.14,  rx: 0.64, ry: 0.41, dx: -0.18, dy: -0.11, period: 15, breathe: 8, depth: 0.09, phase: 5.6 },
  { cx: 0.22, cy: 0.89,  rx: 0.56, ry: 0.36, dx: 0.13, dy: -0.13, period: 12, breathe: 6,  depth: 0.06, phase: 2.4 },
]

// Профиль размытого пятна: не конус, а колокол — так выглядел
// radial-gradient после blur(70px)
const STOPS: [number, number][] = [[0, 0.8], [0.3, 0.66], [0.55, 0.36], [0.8, 0.11], [1, 0]]

type Rgb = [number, number, number, number]

function parseColor(v: string): Rgb | null {
  const m = v.trim().match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/)
  if (!m) return null
  return [+(m[1] ?? 0), +(m[2] ?? 0), +(m[3] ?? 0), m[4] === undefined ? 1 : +m[4]]
}

/** saturate() из CSS-фильтров, применённый к цвету заранее */
function saturate([r, g, b, a]: Rgb, k: number): Rgb {
  const R = (0.213 + 0.787 * k) * r + (0.715 - 0.715 * k) * g + (0.072 - 0.072 * k) * b
  const G = (0.213 - 0.213 * k) * r + (0.715 + 0.285 * k) * g + (0.072 - 0.072 * k) * b
  const B = (0.213 - 0.213 * k) * r + (0.715 - 0.715 * k) * g + (0.072 + 0.928 * k) * b
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x)))
  return [c(R), c(G), c(B), a]
}

function readPalette(): Rgb[] {
  const cs = getComputedStyle(document.documentElement)
  const k = parseFloat(cs.getPropertyValue('--glow-saturate')) || 1
  const out: Rgb[] = []
  for (let i = 1; i <= 6; i++) {
    const c = parseColor(cs.getPropertyValue(`--glow-${i}`))
    out.push(c ? saturate(c, k) : [0, 0, 0, 0])
  }
  return out
}

export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

    let palette = readPalette()
    let blobs = document.documentElement.dataset.theme === 'light' ? LIGHT : DARK
    let w = 0, h = 0, sy = 0, raf = 0, last = 0
    const t0 = performance.now()

    const resize = () => {
      w = Math.ceil(innerWidth / SCALE)
      h = Math.ceil(innerHeight / SCALE)
      canvas.width = w
      canvas.height = h
    }

    const draw = (now: number) => {
      const t = reduce ? 0 : (now - t0) / 1000
      ctx.clearRect(0, 0, w, h)
      blobs.forEach((b, i) => {
        const [r, g, bl, a] = palette[i] ?? [0, 0, 0, 0]
        if (a === 0) return
        const ph = t * Math.PI * 2
        // Дрейф по петле Лиссажу: две частоты, чтобы путь не замыкался в круг
        const x = (b.cx + b.dx * Math.sin(ph / b.period + b.phase)) * w
        const y = (b.cy + b.dy * Math.sin(ph / (b.period * 0.7) + b.phase * 1.3) - sy * b.depth / innerHeight) * h
        const grow = 1 + 0.14 * Math.sin(ph / b.breathe + b.phase * 2)
        // Пятно шире, а пик ниже, чем у исходного градиента: так blur(70px)
        // размазывал энергию, и без него цвета били бы в глаза
        const rx = b.rx * w * grow * 1.2
        const ry = b.ry * h * grow * 1.2
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(rx, ry)
        const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
        for (const [p, k] of STOPS) gr.addColorStop(p, `rgba(${r},${g},${bl},${(a * k).toFixed(3)})`)
        ctx.fillStyle = gr
        ctx.beginPath()
        ctx.arc(0, 0, 1, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (now - last < 1000 / FPS) return
      last = now
      // Параллакс догоняет прокрутку с инерцией: фон тяжёлый
      sy += (Math.max(0, scrollY) - sy) * 0.15
      draw(now)
    }

    const restart = () => {
      cancelAnimationFrame(raf)
      if (reduce || document.hidden) draw(performance.now())
      else raf = requestAnimationFrame(frame)
    }

    resize()
    restart()

    // Тема меняется атрибутом на <html> — перечитываем цвета
    const mo = new MutationObserver(() => {
      palette = readPalette()
      blobs = document.documentElement.dataset.theme === 'light' ? LIGHT : DARK
      draw(performance.now())
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const onResize = () => { resize(); draw(performance.now()) }
    addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', restart)

    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
      removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', restart)
    }
  }, [])

  return <canvas ref={ref} className={s.backdrop} aria-hidden="true" />
}
