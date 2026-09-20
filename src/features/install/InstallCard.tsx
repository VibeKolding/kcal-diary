import { useState } from 'react'
import { Icon } from '@/ui/Icon'
import { Glass } from '@/ui/Glass'
import { Pill } from '@/ui/Pill'
import { useInstall } from './useInstall'
import s from './InstallCard.module.css'

/**
 * Установка на домашний экран.
 *
 * На Android Chrome сам умеет показать окно установки, и достаточно кнопки.
 * В Safari такого окна нет вовсе — единственный путь лежит через меню
 * «Поделиться», и о нём почти никто не знает, поэтому шаги расписаны.
 */
export function InstallCard() {
  const { platform, canPrompt, installed, install } = useInstall()
  const [result, setResult] = useState<string | null>(null)

  if (installed) {
    return (
      <Glass>
        <div className={s.head}>
          <span className={s.title}>Приложение установлено</span>
        </div>
        <p className={`${s.note} ${s.ok}`}>
          Дневник открыт как приложение и работает без интернета.
        </p>
      </Glass>
    )
  }

  return (
    <Glass accent>
      <div className={s.head}>
        <span className={s.title}>Установить на телефон</span>
        <span className={s.hint}>бесплатно</span>
      </div>

      <div className={s.body}>
        <p className={s.note}>
          Дневник можно вынести на домашний экран: своя иконка, открывается
          на весь экран и работает без интернета. Место почти не занимает.
        </p>

        {platform === 'ios' && (
          <div className={s.steps}>
            <div className={s.step}>
              <span className={s.num}>1</span>
              <span>
                Нажмите
                <span className={s.inline}><Icon name="share" size={16} /></span>
                «Поделиться» — внизу экрана в Safari.
              </span>
            </div>
            <div className={s.step}>
              <span className={s.num}>2</span>
              <span>Пролистайте список и выберите «На экран „Домой“».</span>
            </div>
            <div className={s.step}>
              <span className={s.num}>3</span>
              <span>Нажмите «Добавить» в правом верхнем углу.</span>
            </div>
          </div>
        )}

        {platform === 'android-chrome' && (
          canPrompt ? (
            <Pill block onClick={() => void install().then((r) => {
              setResult(r === 'dismissed' ? 'Установку можно запустить позже.' : null)
            })}>
              Установить приложение
            </Pill>
          ) : (
            <div className={s.steps}>
              <div className={s.step}>
                <span className={s.num}>1</span>
                <span>Откройте меню браузера — три точки в правом верхнем углу.</span>
              </div>
              <div className={s.step}>
                <span className={s.num}>2</span>
                <span>Выберите «Установить приложение» или «Добавить на главный экран».</span>
              </div>
            </div>
          )
        )}

        {platform === 'desktop' && (
          canPrompt ? (
            <Pill block onClick={() => void install()}>Установить приложение</Pill>
          ) : (
            <p className={s.note}>
              Откройте дневник на телефоне — там его можно вынести на домашний
              экран и пользоваться как обычным приложением.
            </p>
          )
        )}

        {result && <p className={s.note}>{result}</p>}
      </div>
    </Glass>
  )
}

