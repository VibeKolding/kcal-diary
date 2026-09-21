import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { Theme } from '@/domain/types'

const STORAGE_KEY = 'kcal-theme'

interface ThemeCtx {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

const Ctx = createContext<ThemeCtx | null>(null)

/** То, что возвращает startViewTransition: нам нужны только его промисы */
interface Transition {
  ready: Promise<void>
  finished: Promise<void>
  updateCallbackDone: Promise<void>
}

/**
 * Тема при запуске. Та же логика, что в public/theme.js: файл ставит атрибут
 * до первой отрисовки, а здесь то же значение попадает в состояние React.
 * Разойтись они не должны, иначе первый кадр будет один, а второй другой.
 *
 * Системная тема намеренно не спрашивается: у первого запуска должно быть
 * одно предсказуемое лицо, а переключатель стоит в профиле.
 */
function readInitial(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // приватный режим может запрещать localStorage — тогда светлая
  }
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitial)

  // Layout-эффект: смена атрибута должна попасть внутрь startViewTransition,
  // иначе браузер снимет «до» и «после» с одной и той же темы
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', theme === 'dark' ? '#0B0B0C' : '#EAE6F6')
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // не критично: тема просто не переживёт перезапуск
    }
  }, [theme])

  // Смена темы — кросс-фейд средствами браузера. Где View Transitions нет,
  // тема просто переключается сразу, как и раньше.
  const apply = useCallback((next: (t: Theme) => Theme) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => Transition }
    const reduce = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (doc.startViewTransition && !reduce) {
      const t = doc.startViewTransition(() => flushSync(() => setThemeState(next)))
      // Два быстрых переключения — и первый переход браузер пропускает,
      // отклоняя его промисы (AbortError; в свёрнутой вкладке — TimeoutError).
      // Тема при этом уже сменилась, это не ошибка; без обработчика в
      // консоль падал «Uncaught (in promise)» и мешал ловить настоящие.
      t.ready.catch(() => {})
      t.finished.catch(() => {})
      t.updateCallbackDone.catch(() => {})
    } else {
      setThemeState(next)
    }
  }, [])
  const setTheme = useCallback((t: Theme) => apply(() => t), [apply])
  const toggle = useCallback(() => apply((t) => (t === 'dark' ? 'light' : 'dark')), [apply])

  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme вызван вне ThemeProvider')
  return ctx
}
