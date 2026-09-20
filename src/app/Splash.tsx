import { useEffect, useState } from 'react'
import { Emblem } from './emblem/Emblem'
import { Signature } from '@/ui/Signature'
import s from './Splash.module.css'

/**
 * Заставка при запуске.
 *
 * Показывается, пока готовится база, но не меньше заданного времени —
 * иначе на быстром устройстве она мигнула бы и исчезла, что хуже,
 * чем её отсутствие.
 */
export function Splash({ leaving, hold, onDismiss }: {
  leaving: boolean
  /** Режим просмотра: заставка стоит, пока не коснуться */
  hold?: boolean
  onDismiss?: () => void
}) {
  // Тот же приём, что в эмблеме: появление анимируется, только если
  // браузер действительно рисует. Иначе текст виден сразу.
  const [enter, setEnter] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setEnter(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      className={`${s.screen} ${enter ? s.enter : ''} ${leaving ? s.leaving : ''}`}
      onClick={hold ? onDismiss : undefined}
    >
      <div className={s.mark}>
        <Emblem />
      </div>
      <h1 className={s.title}>Дневник калорий</h1>
      <p className={s.sub}>Всё остаётся на вашем устройстве</p>
      <p className={s.by}>
        <Signature size="lg" shine />
      </p>
      {hold && <p className={s.holdHint}>Коснитесь, чтобы продолжить</p>}
    </div>
  )
}
