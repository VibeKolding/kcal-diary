import type { MuscleGroup } from '@/domain/gym'
import type { Sex } from '@/domain/types'
import s from './MuscleArt.module.css'

/*
 * Силуэт с подсвеченной группой мышц.
 *
 * Нужен потому, что фотографии для раздела появляются отдельно и могут не
 * появиться вовсе: карточка обязана выглядеть законченной без них. Тот же
 * приём, что у обложек блюд, — рисунок собирается из данных, а фотография
 * при наличии просто ложится поверх.
 */

/** Пропорции силуэта. Отличаются только шириной плеч и таза. */
const SHAPE: Record<Sex, { shoulder: number; waist: number; hip: number }> = {
  male: { shoulder: 31, waist: 20, hip: 22 },
  female: { shoulder: 25, waist: 17, hip: 26 },
}

interface Props {
  group: MuscleGroup
  sex: Sex
  height?: number
}

export function MuscleArt({ group, sex, height = 132 }: Props) {
  const b = SHAPE[sex]
  const cx = 60

  // Ключевые точки корпуса: плечи, талия, таз
  const shoulderY = 46
  const waistY = 92
  const hipY = 112

  const torso = [
    `M ${cx - b.shoulder} ${shoulderY}`,
    `C ${cx - b.shoulder} ${shoulderY + 6} ${cx - b.waist - 2} ${waistY - 18} ${cx - b.waist} ${waistY}`,
    `L ${cx - b.hip} ${hipY}`,
    `L ${cx + b.hip} ${hipY}`,
    `L ${cx + b.waist} ${waistY}`,
    `C ${cx + b.waist + 2} ${waistY - 18} ${cx + b.shoulder} ${shoulderY + 6} ${cx + b.shoulder} ${shoulderY}`,
    'Z',
  ].join(' ')

  return (
    <svg
      className={s.art}
      viewBox="0 0 120 170"
      height={height}
      role="img"
      aria-label={`Силуэт с подсвеченной группой мышц: ${GROUP_ALT[group]}`}
    >
      {/* Базовая фигура — всегда приглушённая, подсветку даёт только группа */}
      <g className={s.body}>
        <circle cx={cx} cy={24} r={12} />
        <path d={`M ${cx - 7} 34 h 14 v 10 h -14 Z`} />
        <path d={torso} />
        {/* Руки */}
        <path d={`M ${cx - b.shoulder - 1} ${shoulderY} l -9 6 l 3 34 l 8 -2 Z`} />
        <path d={`M ${cx + b.shoulder + 1} ${shoulderY} l 9 6 l -3 34 l -8 -2 Z`} />
        <path d={`M ${cx - b.shoulder - 7} ${shoulderY + 40} l 8 -2 l 4 28 l -8 1 Z`} />
        <path d={`M ${cx + b.shoulder + 7} ${shoulderY + 40} l -8 -2 l -4 28 l 8 1 Z`} />
        {/* Ноги */}
        <path d={`M ${cx - b.hip} ${hipY} l 17 0 l -2 44 l -13 0 Z`} />
        <path d={`M ${cx + b.hip} ${hipY} l -17 0 l 2 44 l 13 0 Z`} />
      </g>

      <g className={s.hot}>{HIGHLIGHT[group](cx, b, { shoulderY, waistY, hipY })}</g>
    </svg>
  )
}

type Geo = { shoulderY: number; waistY: number; hipY: number }
type Shape = { shoulder: number; waist: number; hip: number }

/*
 * Подсветка рисуется поверх силуэта на месте самой мышцы. Фигура видна
 * спереди, поэтому спина показана широчайшими по бокам корпуса, а трицепс —
 * внешней стороной плеча: это те их части, которые видны с этого ракурса.
 */
const HIGHLIGHT: Record<MuscleGroup, (cx: number, b: Shape, g: Geo) => JSX.Element> = {
  chest: (cx, b, g) => (
    <>
      <path d={`M ${cx - 2} ${g.shoulderY + 2} l -${b.shoulder - 5} 2 l 3 16 l ${b.shoulder - 7} 3 Z`} />
      <path d={`M ${cx + 2} ${g.shoulderY + 2} l ${b.shoulder - 5} 2 l -3 16 l -${b.shoulder - 7} 3 Z`} />
    </>
  ),
  biceps: (cx, b, g) => (
    <>
      <ellipse cx={cx - b.shoulder - 4} cy={g.shoulderY + 22} rx={5} ry={13} />
      <ellipse cx={cx + b.shoulder + 4} cy={g.shoulderY + 22} rx={5} ry={13} />
    </>
  ),
  triceps: (cx, b, g) => (
    <>
      <ellipse cx={cx - b.shoulder - 8} cy={g.shoulderY + 24} rx={4} ry={14} />
      <ellipse cx={cx + b.shoulder + 8} cy={g.shoulderY + 24} rx={4} ry={14} />
    </>
  ),
  back: (cx, b, g) => (
    <>
      <path d={`M ${cx - b.shoulder + 2} ${g.shoulderY + 6} l -3 0 l 6 ${g.waistY - g.shoulderY - 16} l 9 -6 Z`} />
      <path d={`M ${cx + b.shoulder - 2} ${g.shoulderY + 6} l 3 0 l -6 ${g.waistY - g.shoulderY - 16} l -9 -6 Z`} />
    </>
  ),
  shoulders: (cx, b, g) => (
    <>
      <ellipse cx={cx - b.shoulder - 1} cy={g.shoulderY + 4} rx={8} ry={7} />
      <ellipse cx={cx + b.shoulder + 1} cy={g.shoulderY + 4} rx={8} ry={7} />
    </>
  ),
  legs: (cx, b, g) => (
    <>
      <path d={`M ${cx - b.hip + 2} ${g.hipY + 3} l 13 0 l -2 30 l -10 0 Z`} />
      <path d={`M ${cx + b.hip - 2} ${g.hipY + 3} l -13 0 l 2 30 l 10 0 Z`} />
    </>
  ),
}

const GROUP_ALT: Record<MuscleGroup, string> = {
  chest: 'грудь', biceps: 'бицепс', triceps: 'трицепс',
  back: 'спина', shoulders: 'плечи', legs: 'ноги',
}
