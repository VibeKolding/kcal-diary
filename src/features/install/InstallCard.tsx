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
 *
 * Установка здесь не ради иконки: это защита дневника. Данные живут только
 * в браузере, и вкладку система вправе вычистить сама, а установленное
 * приложение — нет. Поэтому «зачем» написано прямо под шагами.
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

  const promptButton = (
    <Pill block onClick={() => void install().then((r) => {
      setResult(r === 'dismissed' ? 'Установку можно запустить позже.' : null)
    })}>
      Установить приложение
    </Pill>
  )

  return (
    <Glass accent>
      <div className={s.head}>
        <span className={s.title}>
          {platform === 'desktop' && canPrompt ? 'Установить на компьютер' : 'Установить на телефон'}
        </span>
        <span className={s.hint}>бесплатно</span>
      </div>

      <div className={s.body}>
        <p className={s.note}>
          Дневник можно вынести на домашний экран: своя иконка, открывается
          на весь экран и работает без интернета. Место почти не занимает.
        </p>

        {platform === 'ios' && (
          <>
            <div className={s.steps}>
              <div className={s.step}>
                <span className={s.num}>1</span>
                <span>
                  Откройте дневник в Safari и нажмите
                  <span className={s.inline}><Icon name="share" size={16} /></span>
                  «Поделиться» — внизу экрана.
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
            {/* Правило Safari: данные сайта, в который не заходили неделю,
                стираются сами. Приложений с домашнего экрана оно не касается. */}
            <p className={s.why}>
              <strong>Зачем:</strong> во вкладке Safari iPhone сам стирает данные
              сайта, если в него неделю не заходить, — вместе с дневником.
              Приложение на домашнем экране он так не чистит.
            </p>
          </>
        )}

        {platform === 'android-chrome' && (
          canPrompt ? promptButton : (
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
          canPrompt ? promptButton : (
            <p className={s.note}>
              Откройте дневник на телефоне — там его можно вынести на домашний
              экран и пользоваться как обычным приложением.
            </p>
          )
        )}

        {(platform === 'android-chrome' || (platform === 'desktop' && canPrompt)) && (
          <p className={s.why}>
            <strong>Зачем:</strong> во вкладке браузер считает записи временными
            и при нехватке места может стереть их сам. У приложения на домашнем
            экране они хранятся постоянно.
          </p>
        )}

        {result && <p className={s.note}>{result}</p>}
      </div>
    </Glass>
  )
}
