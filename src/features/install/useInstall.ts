import { useState, useSyncExternalStore } from 'react'

/** Событие, которым Chrome предлагает установку. В типах браузера его нет. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type Platform = 'ios' | 'android-chrome' | 'desktop' | 'installed'

export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'desktop'

  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  if (standalone) return 'installed'

  const ua = navigator.userAgent
  // iPadOS 13+ представляется как Mac, отличаем по наличию тача
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (isIOS) return 'ios'
  if (/Android/.test(ua)) return 'android-chrome'
  return 'desktop'
}

export interface InstallState {
  /** Chrome готов показать системное окно установки */
  canPrompt: boolean
  /** Установили прямо сейчас, в этой вкладке */
  installed: boolean
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

/**
 * Хранилище отложенного предложения установки.
 *
 * Chrome присылает beforeinstallprompt один раз за загрузку и рано: обычно
 * в первые доли секунды, пока ещё идёт заставка. Слушатель внутри хука
 * экрана профиля его не заставал — к моменту, когда человек открывал
 * профиль, событие давно прошло, и кнопки установки не было никогда.
 * Поэтому событие ловится при загрузке модуля и живёт здесь, а карточка
 * только читает его и подписывается на перемены.
 *
 * Источник событий передаётся параметром, чтобы поведение проверялось
 * тестом на обычном EventTarget, без браузера.
 */
export function createInstallStore(target: EventTarget) {
  let deferred: InstallPromptEvent | null = null
  let state: InstallState = { canPrompt: false, installed: false }
  const listeners = new Set<() => void>()

  // Снимок заменяется целиком: useSyncExternalStore сравнивает его по ссылке
  const set = (next: InstallState) => {
    state = next
    listeners.forEach((l) => l())
  }

  target.addEventListener('beforeinstallprompt', (e) => {
    // Без preventDefault Chrome покажет свою плашку в неудобный момент —
    // прямо поверх заставки. Установка остаётся за кнопкой в профиле.
    e.preventDefault()
    deferred = e as InstallPromptEvent
    set({ ...state, canPrompt: true })
  })
  target.addEventListener('appinstalled', () => {
    deferred = null
    set({ canPrompt: false, installed: true })
  })

  return {
    getSnapshot: (): InstallState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async install(): Promise<InstallOutcome> {
      const e = deferred
      if (!e) return 'unavailable'
      // Событие одноразовое: второй вызов prompt() бросит исключение.
      // Забираем его до вызова, чтобы двойное касание не дошло до второго.
      deferred = null
      set({ ...state, canPrompt: false })
      try {
        await e.prompt()
      } catch {
        // Chrome отказал, например без касания пользователя. Окно так и
        // не открылось, событие не израсходовано — кнопка возвращается.
        deferred = e
        set({ ...state, canPrompt: true })
        return 'unavailable'
      }
      const { outcome } = await e.userChoice
      return outcome
    },
  }
}

// Слушатель встаёт, как только модуль загружен. Модуль входит в первый
// чанк (App → ProfileScreen → InstallCard), а модульные скрипты
// выполняются до DOMContentLoaded — Chrome же присылает событие только
// после загрузки страницы (проверено вживую). Если профиль когда-нибудь
// станет ленивым, модуль нужно импортировать из main.tsx отдельно.
// Вне браузера, в тестах, событий не будет — подойдёт пустой EventTarget.
const store = createInstallStore(
  typeof window !== 'undefined' && typeof window.addEventListener === 'function'
    ? window
    : new EventTarget(),
)

/**
 * Установка приложения на домашний экран.
 *
 * Chrome даёт событие beforeinstallprompt, и его нужно перехватить и придержать:
 * вызвать prompt() позже, по нажатию пользователя. Safari такого события не
 * присылает вовсе — там остаётся только показать инструкцию.
 */
export function useInstall() {
  // Платформа не меняется за время жизни страницы: определяем её сразу,
  // а не в эффекте, иначе первый кадр показывал бы совет для компьютера
  const [platform] = useState(detectPlatform)
  const { canPrompt, installed } = useSyncExternalStore(store.subscribe, store.getSnapshot)

  return {
    platform,
    /** Chrome готов показать системное окно установки */
    canPrompt,
    installed: installed || platform === 'installed',
    install: store.install,
  }
}
