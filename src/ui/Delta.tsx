import { deviation } from '@/domain/nutrition'

const TONE = { over: 'u-delta-over', under: 'u-delta-under', onTarget: 'u-delta-on' } as const
const WORD = { over: 'перебор ', under: 'недобор ', onTarget: '' } as const

interface Props {
  value: number
  target: number
  /** 'number' — всегда число со знаком: в подсказке графика важнее компактность */
  mode?: 'word' | 'number'
}

/**
 * Капсула отклонения от нормы. Тон — вторичен: знак и слово для скринридера
 * есть всегда, на один цвет смысл не завязан.
 */
export function Delta({ value, target, mode = 'word' }: Props) {
  const { kind, amount } = deviation(value, target)
  if (kind === 'none') return null
  const asWord = mode === 'word' && kind === 'onTarget'
  return (
    <span className={`u-delta ${TONE[kind]}`}>
      <span className="sr-only">{WORD[kind]}</span>
      {asWord ? 'в норме' : `${value >= target ? '+' : '−'}${amount}`}
    </span>
  )
}
