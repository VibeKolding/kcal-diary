import { useEffect, useRef, useState } from 'react'

const EASE_OUT = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Число, которое докручивается до нового значения, а не перескакивает.
 *
 * Анимируется только смена: при первом показе значение стоит сразу,
 * иначе при каждом возврате на экран цифры бегали бы от нуля.
 * При отключённом движении в системе возвращает значение как есть.
 */
export function useCountUp(value: number, duration = 320): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const frame = useRef(0)

  useEffect(() => {
    const reduce = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || from.current === value) {
      from.current = value
      setShown(value)
      return
    }

    const start = performance.now()
    const begin = from.current
    const delta = value - begin

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const next = begin + delta * EASE_OUT(t)
      setShown(t < 1 ? next : value)
      if (t < 1) frame.current = requestAnimationFrame(step)
      else from.current = value
    }
    frame.current = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame.current)
      from.current = value
    }
  }, [value, duration])

  return shown
}
