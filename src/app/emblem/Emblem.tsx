import { lazy, Suspense } from 'react'
import { Logo, EMBLEM_FALLBACK_RATIO } from '@/ui/Logo'
import { ErrorBoundary } from '../ErrorBoundary'

const ThreeEmblem = lazy(() => import('./ThreeEmblem').then((m) => ({ default: m.ThreeEmblem })))

/**
 * Эмблема заставки: объёмный знак из золотого стекла (three, отдельный чанк).
 * Пока чанк едет, и там, где WebGL нет, — плоский SVG-знак.
 */
const SIZE = 224

export function Emblem() {
  const flat = Math.round(SIZE * EMBLEM_FALLBACK_RATIO)
  const logo = <Logo size={flat} animated solid />
  // Чанк не приехал (офлайн в первой сессии, старый хэш после выкладки) —
  // это не повод ронять заставку, а с ней и запуск: остаётся плоский знак
  return (
    <ErrorBoundary fallback={() => logo}>
      <Suspense fallback={logo}>
        <ThreeEmblem size={SIZE} />
      </Suspense>
    </ErrorBoundary>
  )
}
