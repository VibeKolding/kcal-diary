import { useEffect, useId, useMemo, useState } from 'react'
import { LEAF_PATH, veinsPath } from './leaf'
import s from './Logo.module.css'

/**
 * Эмблема приложения: золотое кольцо с листом внутри.
 *
 * Кольцо — то же самое, что встречает на главном экране, только с разрывом,
 * поэтому знак и интерфейс читаются как одно целое.
 *
 * solid — лист залит и прорезан теми же прожилками, что у объёмного знака.
 * Такой знак стоит заглушкой на заставке, пока едет объёмный: контурный
 * лист, как и лист без прорезей, превращал подмену в смену знака вместо
 * появления объёма. Везде, где знак стоит сам по себе, он контурный.
 */
/**
 * Во сколько раз плоская заглушка меньше холста объёмного знака.
 *
 * Кольцо SVG занимает 80 % своего поля, а в сцене при её камере — 70 %
 * холста. Без этой поправки знак при подмене прыгал в полтора раза.
 */
export const EMBLEM_FALLBACK_RATIO = 0.87

export function Logo({ size = 96, animated = false, solid = false }: {
  size?: number
  animated?: boolean
  solid?: boolean
}) {
  // Анимация включается только после первого настоящего кадра. Если браузер
  // кадров не рисует (фоновая вкладка, экономия энергии), класс не появится
  // и знак останется просто видимым — вместо пустого экрана.
  const [enter, setEnter] = useState(false)
  // Прорези считаются только для залитого листа: контурному они не нужны,
  // а он стоит в профиле и на онбординге
  const cuts = useMemo(() => (solid ? veinsPath() : null), [solid])
  const maskId = `leafCuts${useId().replace(/:/g, '')}`
  useEffect(() => {
    if (!animated) return
    const id = requestAnimationFrame(() => setEnter(true))
    return () => cancelAnimationFrame(id)
  }, [animated])

  return (
    <span className={`${s.wrap} ${enter ? s.animated : ''}`} style={{ width: size, height: size }}>
      <svg
        className={s.svg} width={size} height={size} viewBox="0 0 100 100"
        role="img" aria-label="Дневник калорий"
      >
        <defs>
          <linearGradient id="logoGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--gold-1)" />
            <stop offset="100%" stopColor="var(--gold-2)" />
          </linearGradient>
          {/* Маска, а не дыры в самом пути: лист утолщён обводкой, и она
              заливала бы концы прорезей у края */}
          {cuts && (
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              <rect width="100" height="100" fill="#fff" />
              <path d={cuts} fill="#000" />
            </mask>
          )}
        </defs>

        {/* Разрыв кольца сверху справа — там же, где на кольце калорий
            начинается отсчёт. У заглушки он довёрнут в то же место, где
            стоит разрыв у объёмного знака, иначе при подмене кольцо
            проворачивается на треть циферблата. */}
        <circle
          className={s.ring}
          cx="50" cy="50" r="40"
          strokeWidth="6"
          strokeDasharray="251"
          strokeDashoffset="32"
          transform={`rotate(${solid ? -22 : -78} 50 50)`}
        />

        {/* Один лист вместо двух: на размере иконки две половины сливались
            и знак читался как чужая фигура. */}
        <g className={`${s.leaf} ${solid ? s.leafSolid : ''}`} mask={cuts ? `url(#${maskId})` : undefined}>
          <path d={LEAF_PATH} strokeWidth="4.5" />
          {!solid && <path d="M39 66c6-8 13-14 21-18" strokeWidth="4.5" />}
        </g>
      </svg>
    </span>
  )
}
