import type { DishToken } from '@/db/catalog'
import s from './DishArt.module.css'

interface Props {
  tokens: DishToken[]
  bowl?: boolean
  /** Оттенок фона, 0..360. Разводит соседние карточки по цвету. */
  hue: number
  /** Готовое фото: если оно есть, рисунок не используется */
  photo?: { src: string; credit: string } | undefined
  height?: number
  /** thumb — тесная кадрировка для списка, чтобы блюдо не терялось */
  variant?: 'cover' | 'thumb'
}

/**
 * Рисунок блюда: посуда плюс две-три составляющие из состава рецепта.
 *
 * Формы намеренно простые. Реалистичная еда в векторе выглядит плохо
 * и всё равно не заменит фотографию, а условный знак читается мгновенно
 * и не обещает того, чего не будет в тарелке.
 */
export function DishArt({
  tokens, bowl, hue, photo, height = 168, variant = 'cover',
}: Props) {
  const box = variant === 'thumb'
    ? { w: 160, h: 116, x: 80, y: 70, scale: 0.66 }
    : { w: 320, h: 168, x: 160, y: 96, scale: 1 }
  if (photo) {
    return (
      <div className={s.wrap}>
        <img className={s.photo} src={photo.src} alt="" loading="lazy" />
        {/* На миниатюре подпись нечитаема и закрывает само фото.
            Указание автора живёт на крупной обложке рецепта
            и в public/images/recipes/CREDITS.md — этого лицензия требует. */}
        {variant !== 'thumb' && <span className={s.credit}>{photo.credit}</span>}
      </div>
    )
  }

  const id = `dish${Math.round(hue)}`

  return (
    <div className={s.wrap}>
      <svg
        className={s.svg} viewBox={`0 0 ${box.w} ${box.h}`} height={height}
        role="img" aria-label="Иллюстрация блюда"
      >
        <defs>
          <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`hsl(${hue} 62% 62% / 0.34)`} />
            <stop offset="55%" stopColor={`hsl(${(hue + 42) % 360} 58% 56% / 0.18)`} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
          <radialGradient id={`${id}glow`} cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor={`hsl(${hue} 70% 68% / 0.30)`} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        <rect width={box.w} height={box.h} fill={`url(#${id}bg)`} />
        <rect width={box.w} height={box.h} fill={`url(#${id}glow)`} />

        <g transform={`translate(${box.x} ${box.y}) scale(${box.scale})`}>
          {bowl ? <Bowl /> : <Plate />}
          <Contents tokens={tokens} bowl={!!bowl} />
        </g>
      </svg>
    </div>
  )
}

const PLATE = 'rgba(255,255,255,0.20)'
const PLATE_EDGE = 'rgba(255,255,255,0.42)'

function Plate() {
  return (
    <g>
      <ellipse cx="0" cy="6" rx="96" ry="34" fill={PLATE} />
      <ellipse cx="0" cy="6" rx="96" ry="34" fill="none" stroke={PLATE_EDGE} strokeWidth="1.5" />
      <ellipse cx="0" cy="4" rx="74" ry="25" fill="none" stroke={PLATE_EDGE} strokeWidth="1" opacity="0.6" />
    </g>
  )
}

function Bowl() {
  return (
    <g>
      <path d="M-84 -8a84 84 0 0 0 168 0Z" fill={PLATE} />
      <path d="M-84 -8a84 84 0 0 0 168 0Z" fill="none" stroke={PLATE_EDGE} strokeWidth="1.5" />
      <ellipse cx="0" cy="-8" rx="84" ry="17" fill="rgba(255,255,255,0.10)" stroke={PLATE_EDGE} strokeWidth="1.5" />
    </g>
  )
}

/** Раскладка: главная составляющая в центре, остальные по бокам */
function Contents({ tokens, bowl }: { tokens: DishToken[]; bowl: boolean }) {
  const y = bowl ? -16 : -8
  const spots: { x: number; y: number; scale: number }[] = [
    { x: 0, y, scale: 1 },
    { x: -46, y: y + 6, scale: 0.78 },
    { x: 46, y: y + 6, scale: 0.78 },
  ]

  return (
    <g>
      {tokens.slice(0, 3).map((token, i) => {
        const spot = spots[i]!
        return (
          <g key={token} transform={`translate(${spot.x} ${spot.y}) scale(${spot.scale})`}>
            {TOKENS[token]}
          </g>
        )
      })}
    </g>
  )
}

/* Формы нарисованы вокруг точки (0,0) и рассчитаны на масштаб около 1 */
const TOKENS: Record<DishToken, JSX.Element> = {
  chicken: <>
    <path d="M-26 6c0-14 11-24 26-24s26 10 26 24c0 6-4 10-10 10h-32c-6 0-10-4-10-10Z" fill="#E8C9A0" stroke="#C29A66" strokeWidth="2" />
    <path d="M-14 -4c6-4 14-5 22-2" stroke="#C29A66" strokeWidth="2" fill="none" strokeLinecap="round" />
  </>,
  meat: <>
    <path d="M-28 8c-4-16 6-28 24-28 20 0 32 12 30 26-1 8-8 10-16 10h-28c-6 0-9-3-10-8Z" fill="#C77B63" stroke="#9A5442" strokeWidth="2" />
    <circle cx="16" cy="-2" r="6" fill="#F0E2D0" stroke="#9A5442" strokeWidth="1.5" />
  </>,
  fish: <>
    <path d="M-30 0c10-14 24-18 36-18s24 6 30 18c-8 12-18 18-30 18s-26-4-36-18Z" fill="#EDA184" stroke="#C97355" strokeWidth="2" />
    <path d="M-30 0h60" stroke="#C97355" strokeWidth="1.5" opacity="0.7" />
    <circle cx="18" cy="-4" r="2.5" fill="#8A4A34" />
  </>,
  egg: <>
    <ellipse cx="0" cy="0" rx="28" ry="20" fill="#FBF3E4" stroke="#DCC9A8" strokeWidth="2" />
    <circle cx="2" cy="-1" r="10" fill="#F2B237" stroke="#D08F1E" strokeWidth="1.5" />
  </>,
  grain: <>
    <path d="M-28 10c0-14 12-24 28-24s28 10 28 24Z" fill="#DFC48C" stroke="#B99A5E" strokeWidth="2" />
    <circle cx="-10" cy="0" r="3" fill="#B99A5E" />
    <circle cx="6" cy="-4" r="3" fill="#B99A5E" />
    <circle cx="16" cy="3" r="3" fill="#B99A5E" />
  </>,
  pasta: <>
    <path d="M-26 8c8-16 16-16 24 0M-14 8c8-16 16-16 24 0M-2 8c8-16 16-16 24 0"
      stroke="#E8C978" strokeWidth="5" fill="none" strokeLinecap="round" />
  </>,
  bread: <>
    <path d="M-26 10V-6c0-8 6-12 13-12h26c7 0 13 4 13 12v16Z" fill="#DDBB86" stroke="#B08F5E" strokeWidth="2" />
    <path d="M-26 -2h52" stroke="#B08F5E" strokeWidth="1.5" opacity="0.6" />
  </>,
  dairy: <>
    <ellipse cx="0" cy="0" rx="27" ry="18" fill="#F7F4EE" stroke="#D8D2C6" strokeWidth="2" />
    <ellipse cx="-6" cy="-4" rx="9" ry="6" fill="#FFFFFF" opacity="0.8" />
  </>,
  cheese: <>
    <path d="M-24 10 -8-12h32l8 22Z" fill="#F2CF6B" stroke="#CBA436" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="2" cy="0" r="3.5" fill="#CBA436" />
    <circle cx="14" cy="5" r="2.5" fill="#CBA436" />
  </>,
  tomato: <>
    <circle cx="0" cy="0" r="19" fill="#DE6C55" stroke="#B34A36" strokeWidth="2" />
    <path d="M-6 -18c3-4 9-4 12 0" stroke="#6FA05A" strokeWidth="3" fill="none" strokeLinecap="round" />
  </>,
  cucumber: <>
    <ellipse cx="0" cy="0" rx="26" ry="13" fill="#9FC47C" stroke="#6F9455" strokeWidth="2" />
    <ellipse cx="0" cy="0" rx="15" ry="7" fill="#D6E7C2" opacity="0.8" />
  </>,
  greens: <>
    <path d="M-24 8c0-16 10-26 24-26 0 16-10 26-24 26Z" fill="#8FBF74" stroke="#5F8C4C" strokeWidth="2" />
    <path d="M24 8c0-16-10-26-24-26 0 16 10 26 24 26Z" fill="#A8D08C" stroke="#5F8C4C" strokeWidth="2" />
  </>,
  broccoli: <>
    <circle cx="-9" cy="-6" r="11" fill="#7CA65E" stroke="#547A3E" strokeWidth="2" />
    <circle cx="9" cy="-8" r="10" fill="#8FBA6E" stroke="#547A3E" strokeWidth="2" />
    <circle cx="1" cy="2" r="10" fill="#6F9A52" stroke="#547A3E" strokeWidth="2" />
  </>,
  potato: <>
    <ellipse cx="-8" cy="2" rx="16" ry="12" fill="#E6D3A6" stroke="#BFA271" strokeWidth="2" />
    <ellipse cx="12" cy="-4" rx="13" ry="10" fill="#EFE0BC" stroke="#BFA271" strokeWidth="2" />
  </>,
  carrot: <>
    <path d="M-22 6 12-10l8 8-30 14Z" fill="#E29A4E" stroke="#B87430" strokeWidth="2" strokeLinejoin="round" />
    <path d="M-2 -2 10 -8" stroke="#B87430" strokeWidth="1.5" />
  </>,
  avocado: <>
    <ellipse cx="0" cy="0" rx="19" ry="24" fill="#A9C97E" stroke="#6E914C" strokeWidth="2" />
    <ellipse cx="0" cy="2" rx="10" ry="12" fill="#7B5A32" opacity="0.85" />
  </>,
  banana: <>
    <path d="M-24 -8c4 16 18 24 34 20-2-16-14-26-34-20Z" fill="#F0D46A" stroke="#C7A72F" strokeWidth="2" />
  </>,
  berry: <>
    <circle cx="-10" cy="2" r="9" fill="#C9556F" stroke="#9B3550" strokeWidth="2" />
    <circle cx="8" cy="-4" r="8" fill="#8A5FA8" stroke="#63407C" strokeWidth="2" />
    <circle cx="12" cy="8" r="6" fill="#C9556F" stroke="#9B3550" strokeWidth="2" />
  </>,
  nut: <>
    <ellipse cx="-8" cy="0" rx="11" ry="9" fill="#C99A63" stroke="#9C7040" strokeWidth="2" />
    <ellipse cx="10" cy="4" rx="9" ry="7" fill="#DDB07A" stroke="#9C7040" strokeWidth="2" />
  </>,
  honey: <>
    <path d="M0 -18c8 12 12 18 12 24a12 12 0 0 1-24 0c0-6 4-12 12-24Z" fill="#EFC04E" stroke="#C2932A" strokeWidth="2" />
  </>,
}
