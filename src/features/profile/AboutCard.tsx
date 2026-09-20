import { Glass } from '@/ui/Glass'
import { Logo } from '@/ui/Logo'
import { Signature } from '@/ui/Signature'
import s from './AboutCard.module.css'

/**
 * Выходные данные приложения. Стоят последними в профиле: это то, что ищут
 * осознанно, а не то, что должно попадаться на глаза каждый день.
 */
export function AboutCard() {
  return (
    <Glass>
      <div className={s.row}>
        <Logo size={44} />
        <div className={s.info}>
          <div className={s.name}>Дневник калорий</div>
          <div className={`${s.version} num`}>Версия {__APP_VERSION__}</div>
        </div>
        <Signature className={s.by} />
      </div>

      <p className={s.note}>
        Приложение не собирает данные и не отправляет их никуда.
        Всё, что вы записываете, остаётся на этом устройстве.
      </p>
    </Glass>
  )
}
