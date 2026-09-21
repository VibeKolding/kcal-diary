import type { ReactNode } from 'react'

/**
 * Единый набор штриховых иконок: один viewBox, одна толщина линии,
 * скруглённые концы. Раньше по проекту жили девять разных толщин и два
 * разных «плюса» в соседних местах.
 */
const PATHS = {
  today: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></>,
  gym: <><path d="M6.5 7.5v9M3.5 10v4M17.5 7.5v9M20.5 10v4M6.5 12h11" /></>,
  stats: <><path d="M5 19V10M12 19V5M19 19v-6" /></>,
  profile: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  'chevron-left': <path d="M15 5 8 12l7 7" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  check: <path d="M4 12.5 9.5 18 20 6.5" />,
  warn: <><path d="M12 8v5M12 16.5v.5" /><circle cx="12" cy="12" r="9" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1v1h6v-1c0-.4.1-.8.5-1.1A6 6 0 0 0 12 3Z" /></>,
  share: <><path d="M12 15V4" /><path d="m8 8 4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></>,
  plate: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /></>,
  recipe: <><path d="M6 4h9l4 4v12H6z" /><path d="M9 12h6M9 16h6" /></>,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  bell: <><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21h4" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M9 2h6" /></>,
  // Фонарик головой вверх: раструб, корпус и кнопка на нём
  flashlight: <><path d="M7 3h10v3l-2.5 4v9.5A1.5 1.5 0 0 1 13 21h-2a1.5 1.5 0 0 1-1.5-1.5V10L7 6z" /><path d="M7 6h10M12 13.5v2" /></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

interface Props {
  name: IconName
  size?: number
  /** Толще только у крупных акцентов вроде «+» в таб-баре */
  strokeWidth?: number
  className?: string
}

export function Icon({ name, size = 20, strokeWidth = 1.75, className }: Props) {
  return (
    <svg
      className={className}
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
