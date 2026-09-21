import { useEffect, useRef, useState } from 'react'
import { useTilt } from './useTilt'
import { Logo, EMBLEM_FALLBACK_RATIO } from '@/ui/Logo'
import s from './Emblem.module.css'

/**
 * Вариант 4: настоящее 3D. Сцена подгружается отдельным чанком вместе
 * с three — на заставку без этого варианта он не попадает.
 * Нет WebGL или чанк ещё едет — SVG-знак.
 */
export function ThreeEmblem({ size = 224 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const tiltRef = useRef({ x: 0, y: 0 })
  useTilt(ready, (t) => { tiltRef.current = { x: t.x, y: t.y } })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let alive = true
    let raf = 0
    let scene: Awaited<ReturnType<typeof load>> | null = null

    async function load() {
      const { createEmblemScene } = await import('./scene')
      // Полная плотность экрана: при прежнем потолке в два на трёхкратном
      // экране кадр растягивался в полтора раза, и прорези листа мылились
      return createEmblemScene(canvas!, size, window.devicePixelRatio || 1)
    }

    load().then((sc) => {
      if (!alive) { sc.dispose(); return }
      scene = sc
      setReady(true)
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      // Стоп-кадр появления для снимков: /?emblemT=0.4
      const frozen = Number(new URLSearchParams(location.search).get('emblemT'))
      const ENTER_MS = 900
      let start = 0
      const frame = (t: number) => {
        if (!start) start = t
        // Время отсчитывается от появления знака, а не от загрузки страницы.
        // С абсолютным временем фаза парения и положение источников света
        // на каждом запуске были свои, и прожилка то ловила блик и читалась
        // белой чертой, то выглядела как надо.
        const elapsed = t - start
        const progress = reduce ? 1 : frozen > 0 ? frozen : Math.min(1, elapsed / ENTER_MS)
        sc.render(tiltRef.current.x, tiltRef.current.y, reduce ? 0 : elapsed, progress)
        if (!reduce) raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
    }).catch(() => setFailed(true))

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      scene?.dispose()
    }
  }, [size])

  const flat = Math.round(size * EMBLEM_FALLBACK_RATIO)

  if (failed) return <Logo size={flat} animated solid />

  return (
    <div className={s.stage} style={{ width: size, height: size }}>
      {!ready && <Logo size={flat} animated solid />}
      <canvas
        ref={canvasRef}
        className={`${s.canvas} ${ready ? s.enter : ''}`}
        width={size} height={size}
        style={{ width: size, height: size, position: ready ? 'relative' : 'absolute', opacity: ready ? 1 : 0 }}
        aria-label="Дневник калорий" role="img"
      />
    </div>
  )
}
