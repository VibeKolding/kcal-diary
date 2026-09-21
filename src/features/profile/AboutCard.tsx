import { Glass } from '@/ui/Glass'
import { Logo } from '@/ui/Logo'
import { Signature } from '@/ui/Signature'
import s from './AboutCard.module.css'

/**
 * Выходные данные приложения. Стоят последними в профиле: это то, что ищут
 * осознанно, а не то, что должно попадаться на глаза каждый день.
 *
 * Текст о данных обязан быть точным, а не красивым. Раньше здесь стояло
 * «не отправляет их никуда», хотя штрихкод уходит в Open Food Facts, — и
 * это видно любому, кто откроет сетевые запросы.
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
        Без регистрации и учётной записи. Всё, что вы записываете, хранится
        только на этом устройстве.
      </p>
      <p className={s.note}>
        В сеть уходят только цифры штрихкода — и только когда продукта нет во
        встроенной базе: по ним дневник ищет его в открытой базе
        Open Food Facts.
      </p>

      <div className={s.legal}>
        <p>
          Данные о продуктах по штрихкоду —{' '}
          <a
            className={s.link} href="https://world.openfoodfacts.org"
            target="_blank" rel="noopener noreferrer"
          >Open Food Facts</a> (ODbL).
        </p>
        <p>Расчёты справочные и не заменяют консультацию врача.</p>
        <p>© {__APP_AUTHOR__}, все права защищены.</p>
        <p>
          <a
            className={s.link} href="/third-party-licenses.txt"
            target="_blank" rel="noopener noreferrer"
          >Сторонние библиотеки и их лицензии</a>
        </p>
      </div>
    </Glass>
  )
}
