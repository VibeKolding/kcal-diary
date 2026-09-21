import { useEffect, useRef } from 'react'

export interface Tilt { x: number; y: number }

const MAX = 12

/**
 * Наклон за пальцем и за гироскопом, в градусах ±MAX.
 *
 * Без React-состояния: кадр приходит в onFrame, а компонент пишет стили
 * прямо в элементы. Перерисовывать дерево шестьдесят раз в секунду ради
 * двух чисел — расточительно, на слабом телефоне заметно.
 *
 * Гироскоп на iOS требует разрешения, и спросить его можно только из
 * жеста — поэтому просим при первом касании заставки, а до этого молчим.
 * При отключённом движении в системе кадр приходит один раз с нулями.
 *
 * deviceorientation работает, только если Permissions-Policy разрешает
 * странице accelerometer и gyroscope (а для абсолютной ориентации ещё и
 * magnetometer). Заголовок живёт в четырёх местах — src/app/securityHeaders.ts
 * и копии для хостингов; запрет в одном из них молча отключал наклон.
 */
export function useTilt(enabled: boolean, onFrame: (t: Tilt) => void): void {
  const cb = useRef(onFrame)
  cb.current = onFrame

  useEffect(() => {
    if (!enabled) return
    const reduce = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { cb.current({ x: 0, y: 0 }); return }

    const cur: Tilt = { x: 0, y: 0 }
    const target: Tilt = { x: 0, y: 0 }
    let raf = 0
    cb.current(cur)

    const step = () => {
      const nx = cur.x + (target.x - cur.x) * 0.12
      const ny = cur.y + (target.y - cur.y) * 0.12
      if (Math.abs(nx - cur.x) > 0.005 || Math.abs(ny - cur.y) > 0.005) {
        cur.x = nx; cur.y = ny
        cb.current(cur)
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    const onPointer = (e: PointerEvent) => {
      target.x = ((e.clientY / window.innerHeight) - 0.5) * -2 * MAX
      target.y = ((e.clientX / window.innerWidth) - 0.5) * 2 * MAX
    }
    const onLeave = () => { target.x = 0; target.y = 0 }
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return
      // beta — наклон вперёд-назад (в руке ~45°), gamma — влево-вправо
      target.x = Math.max(-MAX, Math.min(MAX, (45 - e.beta) * 0.6))
      target.y = Math.max(-MAX, Math.min(MAX, e.gamma * 0.6))
    }
    // Интерфейса может не быть вовсе (урезанные сборки, старые встроенные
    // браузеры). Обращение к несуществующему имени — ReferenceError, и
    // раньше заставка роняла всё приложение в белый экран на каждом запуске.
    const D = typeof DeviceOrientationEvent === 'undefined'
      ? null
      : DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    // Диалог iOS «Доступ к движению» может висеть дольше заставки. Если
    // она ушла раньше ответа, подписка после него пережила бы очистку.
    let alive = true
    const askOrientation = async () => {
      try {
        if (typeof D?.requestPermission === 'function' && await D.requestPermission() !== 'granted') return
        if (alive) window.addEventListener('deviceorientation', onOrient)
      } catch { /* нет гироскопа — остаётся палец */ }
    }

    window.addEventListener('pointermove', onPointer)
    window.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointerup', onLeave)
    if (typeof D?.requestPermission === 'function') {
      window.addEventListener('pointerdown', askOrientation, { once: true })
    } else if (D) {
      // Android даёт события без разрешения — подключаем сразу
      window.addEventListener('deviceorientation', onOrient)
    }

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointerup', onLeave)
      window.removeEventListener('pointerdown', askOrientation)
      window.removeEventListener('deviceorientation', onOrient)
    }
  }, [enabled])
}
