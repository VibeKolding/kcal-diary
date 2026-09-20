import { lazy, Suspense } from 'react'
import { Logo, EMBLEM_FALLBACK_RATIO } from '@/ui/Logo'

const ThreeEmblem = lazy(() => import('./ThreeEmblem').then((m) => ({ default: m.ThreeEmblem })))

/**
 * Эмблема заставки: объёмный знак из золотого стекла (three, отдельный чанк).
 * Пока чанк едет, и там, где WebGL нет, — плоский SVG-знак.
 */
const SIZE = 224

export function Emblem() {
  const flat = Math.round(SIZE * EMBLEM_FALLBACK_RATIO)
  return (
    <Suspense fallback={<Logo size={flat} animated solid />}>
      <ThreeEmblem size={SIZE} />
    </Suspense>
  )
}
