import s from './Signature.module.css'

/**
 * Подпись автора. На заставке — крупно, с волосяными линиями по бокам;
 * в выходных данных — мелко. Один компонент, чтобы две подписи не
 * расходились метриками, как было раньше.
 *
 * shine — блик, пробегающий по буквам один раз. Нужен только на заставке:
 * там он забирает внимание в конце, когда всё остальное уже на местах.
 */
export function Signature({ size = 'sm', shine, className }: {
  size?: 'lg' | 'sm'
  shine?: boolean
  className?: string
}) {
  return (
    <span className={`${s.sign} ${size === 'lg' ? s.lg : s.sm} ${shine ? s.shineOn : ''} ${className ?? ''}`}>
      <span className={`${s.name} ${shine ? s.shine : ''}`}>By {__APP_AUTHOR__}</span>
    </span>
  )
}
