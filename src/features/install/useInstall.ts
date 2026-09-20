import { useEffect, useState } from 'react'

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

/**
 * Установка приложения на домашний экран.
 *
 * Chrome даёт событие beforeinstallprompt, и его нужно перехватить и придержать:
 * вызвать prompt() позже, по нажатию пользователя. Safari такого события не
 * присылает вовсе — там остаётся только показать инструкцию.
 */
export function useInstall() {
  const [platform, setPlatform] = useState<Platform>('desktop')
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    setPlatform(detectPlatform())

    const onPrompt = (e: Event) => {
      // Без preventDefault Chrome покажет свою плашку в неудобный момент
      e.preventDefault()
      setDeferred(e as InstallPromptEvent)
    }
    const onInstalled = () => { setInstalled(true); setDeferred(null) }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!deferred) return 'unavailable'
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // Событие одноразовое: второй вызов prompt() бросит исключение
    setDeferred(null)
    return outcome
  }

  return {
    platform,
    /** Chrome готов показать системное окно установки */
    canPrompt: deferred !== null,
    installed: installed || platform === 'installed',
    install,
  }
}
