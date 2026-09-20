import { useCountUp } from './useCountUp'

/** Число, которое докручивается до значения. `digits` — знаков после запятой */
export function CountUp({ value, digits = 0 }: { value: number; digits?: number }) {
  const shown = useCountUp(value)
  return <>{shown.toFixed(digits)}</>
}
