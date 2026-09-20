import {
  useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import s from './Sheet.module.css'

interface Props {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
}

/** Сколько длится уход панели — совпадает с анимацией sink в стилях */
const EXIT_MS = 220
/** Дальше этого порога отпущенная панель закрывается, ближе — возвращается */
const DISMISS_PX = 80

type Phase = 'closed' | 'open' | 'closing'

/**
 * Выдвижная панель.
 *
 * Уходит с той же анимацией, что и приходит: пока панель закрывается, она
 * остаётся в DOM с последним содержимым — родитель к этому моменту уже мог
 * обнулить данные. Грабер рабочий: панель можно утянуть вниз пальцем.
 */
export function Sheet({ open, title, onClose, children, actions }: Props) {
  const [phase, setPhase] = useState<Phase>(open ? 'open' : 'closed')
  const [drag, setDrag] = useState(0)
  const dragging = useRef<{ startY: number; pointerId: number } | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  // Последнее «живое» содержимое: показывается, пока панель уезжает
  const last = useRef<{ title?: string; children: ReactNode; actions?: ReactNode }>({ title, children, actions })
  if (open) last.current = { title, children, actions }

  useLayoutEffect(() => {
    if (open) { setPhase('open'); setDrag(0); return }
    setPhase((p) => (p === 'open' ? 'closing' : p))
  }, [open])

  useEffect(() => {
    if (phase !== 'closing') return
    const reduce = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => setPhase('closed'), reduce ? 0 : EXIT_MS)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase !== 'open') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      // Tab не выходит за пределы панели: фон под ней всё равно inert
      if (e.key !== 'Tab' || !sheetRef.current) return
      const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Всё под панелью недоступно ни фокусу, ни скринридеру
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    // Фокус уходит в панель, а при закрытии возвращается туда, откуда пришёл
    const opener = document.activeElement as HTMLElement | null
    sheetRef.current?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      root?.removeAttribute('inert')
      opener?.focus?.({ preventScroll: true })
    }
  }, [phase, onClose])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    dragging.current = { startY: e.clientY, pointerId: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragging.current) return
    setDrag(Math.max(0, e.clientY - dragging.current.startY))
  }
  const onPointerUp = () => {
    if (!dragging.current) return
    dragging.current = null
    if (drag > DISMISS_PX) onClose()
    else setDrag(0)
  }

  if (phase === 'closed') return null

  const shown = open ? { title, children, actions } : last.current
  const closing = phase === 'closing'
  const style = drag > 0
    ? { transform: `translateY(${drag}px)`, transition: 'none' }
    : undefined

  return createPortal(
    <>
      <div className={`${s.backdrop} ${closing ? s.backdropOut : ''}`} onClick={onClose} />
      <div
        ref={sheetRef}
        className={`${s.sheet} ${closing ? s.sheetOut : ''}`}
        style={style}
        role="dialog" aria-modal="true" aria-label={shown.title}
        tabIndex={-1}
      >
        <div
          className={s.handle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className={s.grabber} />
        </div>
        <div className={s.head}>
          <h2 className={s.title}>{shown.title}</h2>
          {shown.actions ?? (
            <button className={`${s.close} pressable`} onClick={onClose} aria-label="Закрыть"><Icon name="close" size={16} /></button>
          )}
        </div>
        <div className={s.body}>{shown.children}</div>
      </div>
    </>,
    document.body,
  )
}
