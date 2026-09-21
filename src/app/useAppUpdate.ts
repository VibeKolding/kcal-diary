import { useCallback, useEffect, useRef, useState } from 'react'
import { watchUpdates, type UpdateState, type Updater } from './swUpdate'

// Пока приложение открыто, браузер сам сверяет воркер только при переходах
// по страницам, а их у одностраничного приложения нет. Установленный дневник
// держат открытым днями — без своей проверки о выкладке он бы не узнал.
const CHECK_EVERY_MS = 60 * 60 * 1000

export interface AppUpdate {
  /** Что показать: ничего, «доступна новая версия» или «обновилось в другом окне» */
  state: UpdateState
  /** «Обновить» или «Перезагрузить» — смотря по состоянию */
  apply: () => void
  /** Скрыть предложение до следующей смены состояния */
  dismiss: () => void
}

/**
 * Новая версия приложения.
 *
 * Сервис-воркер зарегистрирован в режиме prompt: новая сборка встаёт
 * в ожидание и не подменяет открытую страницу. Без этого хука никто
 * не слушал обновления, и новая версия приезжала только после того,
 * как пользователь закрывал все вкладки — то есть никогда.
 *
 * Пока на экране заставка, в этом окне терять нечего — новая версия
 * ставится сразу, окно перезагружается. Другие открытые окна при этом
 * не перезагружаются (см. swUpdate.ts), а показывают предложение.
 *
 * Предложение — отдельная плашка, а не тост: тост один на приложение,
 * и любое следующее сообщение («Удалено», «Вода: …») навсегда стирало
 * «Доступна новая версия».
 */
export function useAppUpdate(startup: boolean): AppUpdate {
  const [state, setState] = useState<UpdateState>('none')
  const [hidden, setHidden] = useState<UpdateState | null>(null)
  const updater = useRef<Updater | null>(null)

  useEffect(() => {
    // В dev воркер не собирается (devOptions выключены) — регистрировать нечего
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    const u = watchUpdates(navigator.serviceWorker, `${import.meta.env.BASE_URL}sw.js`, {
      onState: setState,
      reload: () => location.reload(),
    })
    updater.current = u
    const check = () => { if (document.visibilityState === 'visible') u.check() }
    const timer = window.setInterval(check, CHECK_EVERY_MS)
    // Вернулись к свёрнутому приложению — самое время спросить
    document.addEventListener('visibilitychange', check)
    return () => {
      u.stop()
      updater.current = null
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  useEffect(() => {
    if (startup && state === 'ready') updater.current?.apply()
  }, [startup, state])

  const apply = useCallback(() => {
    if (state === 'elsewhere') location.reload()
    else updater.current?.apply()
  }, [state])

  const dismiss = useCallback(() => setHidden(state), [state])

  return { state: state === hidden ? 'none' : state, apply, dismiss }
}
