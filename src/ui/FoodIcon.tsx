import { useId, useRef, type ReactElement } from 'react'
import type { FoodCategory } from '@/domain/types'
import s from './FoodIcon.module.css'

/**
 * Линейные иконки категорий: строгая графика вместо фотографий,
 * которых у дневника питания взяться неоткуда.
 */
const PATHS: Record<FoodCategory, ReactElement> = {
  meat: <><path d="M5 13c0-4 3-7 7-7s7 2 7 5-2 4-4 5-3 2-5 2-5-2-5-5Z" /><circle cx="8.5" cy="12.5" r="1.8" /></>,
  fish: <><path d="M3 12c3-4 7-5 10-5s6 2 8 5c-2 3-5 5-8 5s-7-1-10-5Z" /><path d="M17 9l4-2v10l-4-2" /><circle cx="8" cy="11" r="0.9" /></>,
  dairy: <><path d="M9 3h6v3l2 4v11H7V10l2-4V3Z" /><path d="M8 13h8" /></>,
  egg: <><ellipse cx="12" cy="13" rx="6" ry="8" /></>,
  grain: <><path d="M12 21V8" /><path d="M12 8c0-3 2-5 4-5 0 3-2 5-4 5Z" /><path d="M12 13c0-3 2-5 4-5 0 3-2 5-4 5Z" /><path d="M12 8c0-3-2-5-4-5 0 3 2 5 4 5Z" /><path d="M12 13c0-3-2-5-4-5 0 3 2 5 4 5Z" /></>,
  bread: <><path d="M4 12c0-3 3-5 8-5s8 2 8 5v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6Z" /><path d="M9 12v8M15 12v8" /></>,
  vegetable: <><path d="M12 21c-4-2-7-6-7-11 4 0 7 2 8 5" /><path d="M13 21c4-2 7-6 7-11-4 0-7 2-8 5" /><path d="M12 15v6" /></>,
  fruit: <><path d="M12 8c-4-3-8 0-8 5s4 8 6 8 1-1 2-1 0 1 2 1 6-3 6-8-4-8-8-5Z" /><path d="M12 8V4c2 0 3 1 3 3" /></>,
  nut: <><circle cx="12" cy="12" r="8" /><path d="M12 4c-3 4-3 12 0 16" /></>,
  sweet: <><path d="M6 11h12l-1.4 8.2a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8L6 11Z" /><path d="M8 11a4 4 0 0 1 8 0" /><path d="M12 7V4" /></>,
  drink: <><path d="M6 6h12l-1 12a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3L6 6Z" /><path d="M7 11h10" /></>,
  oil: <><path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11Z" /></>,
  sauce: <><path d="M10 3h4v3l2 3v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3V3Z" /><path d="M8 12h8" /></>,
  dish: <><path d="M3 16h18" /><path d="M5 16a7 7 0 0 1 14 0" /><path d="M12 6v3" /><path d="M7 20h10" /></>,
  other: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /></>,
}

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  meat: 'Мясо', fish: 'Рыба', dairy: 'Молочное', egg: 'Яйца',
  grain: 'Крупы', bread: 'Хлеб', vegetable: 'Овощи', fruit: 'Фрукты',
  nut: 'Орехи', sweet: 'Сладкое', drink: 'Напитки', oil: 'Масла',
  sauce: 'Соусы', dish: 'Блюда', other: 'Другое',
}

/** Контур стакана — он же форма для жидкости внутри */
const GLASS = 'M6 6h12l-1 12a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3L6 6Z'

interface Props {
  category: FoodCategory
  size?: number
  /** 0..1 — рисует кольцо прогресса вокруг чипа. Значения выше 1 обрезаются. */
  progress?: number
  /** 0..1 — наполняет стакан водой. Только для категории drink. */
  fill?: number
}

export function FoodIcon({ category, size = 40, progress, fill }: Props) {
  const glyph = size * 0.52
  const liquid = category === 'drink' && fill !== undefined
  // У остальных категорий стакана нет, и наполнять нечего — там уровень
  // поднимается в самом чипе: та же метафора сосуда, но без рисунка
  const level = !liquid && fill !== undefined ? Math.min(Math.max(fill, 0), 1) : null
  return (
    <span className={s.chip} style={{ width: size, height: size }}>
      {level !== null && (
        <span className={s.levelClip} aria-hidden="true">
          <span className={s.level} style={{ height: `${level * 100}%` }} />
        </span>
      )}
      {progress !== undefined && <ProgressRing size={size + 10} value={progress} />}
      <svg
        className={s.svg}
        width={glyph} height={glyph} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round"
        role="img" aria-label={CATEGORY_LABELS[category]}
      >
        {liquid ? <GlassOfWater fill={fill} /> : PATHS[category]}
      </svg>
    </span>
  )
}

/**
 * Стакан, который наполняется по-настоящему.
 *
 * Уровень воды — то же число, что и дуга вокруг чипа, но дугу нужно
 * сравнивать глазом, а налитый стакан понятен мгновенно. Поверхность с
 * мениском и блик на стенке: на сорока точках именно эти детали отличают
 * предмет от пиктограммы. Фотография тут не работает — при таком размере
 * она превращается в кашу и выбивается из строя линейных значков.
 *
 * Жидкость нарисована на всю высоту стакана и опускается сдвигом. Так
 * уровень можно анимировать одним transform: перерисовывать путь на каждом
 * кадре дороже и даёт рваное движение.
 */
function GlassOfWater({ fill }: { fill: number }) {
  const id = useId()
  const clip = `${id}-clip`
  const grad = `${id}-grad`
  const glint = `${id}-glint`
  const k = Math.min(Math.max(fill, 0), 1)

  // Каждое изменение уровня перезапускает колыхание: смена key
  // пересоздаёт узел, и анимация начинается заново
  const wave = useRef(0)
  const prev = useRef(k)
  if (prev.current !== k) { prev.current = k; wave.current += 1 }

  return (
    <>
      <defs>
        <clipPath id={clip}><path d={GLASS} /></clipPath>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--water-1)" />
          <stop offset="100%" stopColor="var(--water-2)" />
        </linearGradient>
        <radialGradient id={glint} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--water-shine)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      <g clipPath={`url(#${clip})`}>
        {k > 0 && (
          <g className={s.liquid} style={{ transform: `translateY(${(1 - k) * 14.5}px)` }}>
            {/* Путь шире стакана: при колыхании края не должны обнажаться */}
            <g key={wave.current} className={s.slosh}>
              <path
                d="M-8 7 q4 -1.4 8 0 t8 0 t8 0 t8 0 V25 H-8 Z"
                fill={`url(#${grad})`} stroke="none"
              />
              {/* Блик, медленно идущий по поверхности */}
              <ellipse className={s.glint} cx="0" cy="7.4" rx="4.2" ry="1.1" fill={`url(#${glint})`} stroke="none" />
            </g>
          </g>
        )}
        <path d="M8.4 8v9" stroke="var(--water-shine)" strokeWidth="1.2" strokeLinecap="round" />
      </g>

      <path d={GLASS} />
      <path d="M7 11h10" opacity="0.35" />
    </>
  )
}

/**
 * Дуга вокруг чипа. Нужна там, где у строки есть дневная норма —
 * например у воды: одна цифра «0 / 2460 мл» не показывает, много это или мало.
 */
function ProgressRing({ size, value }: { size: number; value: number }) {
  const stroke = 2.5
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.min(Math.max(value, 0), 1)

  return (
    <svg className={s.ring} width={size} height={size} aria-hidden="true">
      <circle
        className={s.ringTrack}
        cx={size / 2} cy={size / 2} r={r}
        fill="none" strokeWidth={stroke}
      />
      <circle
        className={s.ringValue}
        cx={size / 2} cy={size / 2} r={r}
        fill="none" strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
    </svg>
  )
}
