import { useId, useState, type JSX } from 'react'
import type { Meal } from '@/domain/types'
import s from './MealIcon.module.css'

interface Props {
  meal: Meal
  size?: number
}

/** Готовый рендер приёма пищи. Нет файла — рисуем ту же сцену вектором. */
export function mealArt(meal: Meal): string {
  return `/images/meals/${meal}.webp`
}

/**
 * Значок приёма пищи рядом с заголовком: время суток, а не еда.
 * Восход, полдень, месяц и облако различаются силуэтом, поэтому читаются
 * при 30 пикселях, где тарелка с рыбой превращается в пятно.
 *
 * Декоративный: смысл несёт слово рядом, поэтому aria-hidden — иначе
 * скринридер читает «Завтрак» дважды.
 */
export function MealIcon({ meal, size = 30 }: Props) {
  const id = useId()
  const [broken, setBroken] = useState(false)

  return (
    <span className={s.chip} style={{ width: size, height: size }} aria-hidden="true">
      {broken ? (
        <svg className={`${s.svg} ${s.art}`} width={size * 0.72} height={size * 0.72} viewBox="0 0 40 40">
          <TimeArt meal={meal} id={id} />
        </svg>
      ) : (
        <img
          className={`${s.photo} ${s.art}`}
          src={mealArt(meal)}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  )
}

/* --- Векторная сцена: она же фолбэк, она же эталон для рендеров ----------
 * Три времени суток и яблоко, разведённые дважды: силуэтом и цветом. Одного
 * силуэта мало — восход и полдень оба круглые, и в золоте читались одинаково.
 * Утро розово-коралловое и без лучей, полдень золотой и лучистый, ночь
 * фиолетовая и серпом, перекус зелёный и предметный: он случается между
 * приёмами, и часа у него нет.
 */

const TONES: Record<Meal, [string, string]> = {
  breakfast: ['#FFD9C2', 'color-mix(in srgb, var(--protein) 78%, #C25E3E)'],
  lunch: ['var(--gold-1)', 'var(--gold-2)'],
  dinner: ['var(--crystal-1)', 'var(--crystal-2)'],
  snack: ['color-mix(in srgb, var(--carbs) 62%, #FFFFFF)', 'color-mix(in srgb, var(--carbs) 74%, #2F5B2A)'],
}

function TimeArt({ meal, id }: { meal: Meal; id: string }): JSX.Element {
  const [c1, c2] = TONES[meal]

  return (
    <>
      <defs>
        <radialGradient id={`${id}-t`} cx="35%" cy="30%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="38%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </radialGradient>
        <radialGradient id={`${id}-h`}>
          <stop offset="45%" stopColor={c1} stopOpacity="0.5" />
          <stop offset="100%" stopColor={c1} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="20" cy="20" r="18" fill={`url(#${id}-h)`} />

      {meal === 'breakfast' && (
        <>
          {/* Утро: половина диска над горизонтом. Лучей нет вовсе — они
              отданы полудню, иначе два первых значка снова сольются. */}
          <clipPath id={`${id}-cl`}><rect x="0" y="0" width="40" height="24" /></clipPath>
          <g clipPath={`url(#${id}-cl)`}>
            <circle cx="20" cy="24" r="11.5" fill={`url(#${id}-t)`} />
          </g>
          <path d="M4 26.5h32" stroke={c2} strokeWidth="3" strokeLinecap="round" />
          <path d="M9 32.5h22" stroke={c2} strokeWidth="2.4" strokeLinecap="round" opacity="0.5" />
        </>
      )}

      {meal === 'lunch' && (
        <>
          {/* Полдень: целый диск и восемь лучей — только здесь */}
          <circle cx="20" cy="20" r="8.2" fill={`url(#${id}-t)`} />
          <g stroke={c2} strokeWidth="2.4" strokeLinecap="round">
            <path d="M20 3v3.8M20 33.2V37M3 20h3.8M33.2 20H37" />
            <path d="M8 8l2.7 2.7M29.3 29.3l2.7 2.7M32 8l-2.7 2.7M10.7 29.3L8 32" />
          </g>
        </>
      )}

      {meal === 'dinner' && (
        <>
          {/* Ночь: серп вырезан маской, поэтому край остаётся чистым */}
          <mask id={`${id}-m`}>
            <rect x="0" y="0" width="40" height="40" fill="#000" />
            <circle cx="19" cy="20" r="11.5" fill="#fff" />
            <circle cx="25.5" cy="15" r="9.8" fill="#000" />
          </mask>
          <circle cx="19" cy="20" r="11.5" fill={`url(#${id}-t)`} mask={`url(#${id}-m)`} />
          <circle cx="30" cy="10" r="1.6" fill={c1} />
          <circle cx="33.5" cy="16.5" r="1" fill={c1} opacity="0.75" />
        </>
      )}

      {meal === 'snack' && (
        <>
          {/* Перекус — единственный предметный значок: яблоко. Время суток
              для него не подходит, он случается между приёмами, а не в час.
              Зелень разводит его с рассветом, полднем и ночью по цвету. */}
          <path
            d="M20 14c2.7-3.2 8.4-3.4 10.4 1.6 2.1 5 0 12.9-3.7 16.8-1.9 2-3.8 1-6.7 1s-4.8.9-6.7-1C9.6 28.5 7.5 20.6 9.6 15.6 11.6 10.6 17.3 10.8 20 14Z"
            fill={`url(#${id}-t)`}
          />
          <path d="M20 14V9.4" stroke="#7A5A3A" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M20.7 10.6c2.2-3.4 5.6-3.9 7.2-3-.5 3-3.4 5-7.2 3Z"
            fill="color-mix(in srgb, var(--carbs) 58%, #2F5B2A)" />
          <ellipse cx="15" cy="19.5" rx="2.6" ry="3.6" fill="#FFFFFF" opacity="0.5"
            transform="rotate(-18 15 19.5)" />
        </>
      )}
    </>
  )
}
