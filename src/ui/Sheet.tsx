import {
  useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { ancestry, guardFocus, rescueFocus, trapTab } from './focus'
import { sheetStack, type SheetItem } from './sheetStack'
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
 *
 * Блокировку страницы и системное «назад» ведёт общий учёт панелей
 * (sheetStack.ts): панель только сообщает, что открылась и закрылась.
 */
export function Sheet({ open, title, onClose, children, actions }: Props) {
  const [phase, setPhase] = useState<Phase>(open ? 'open' : 'closed')
  const [drag, setDrag] = useState(0)
  const dragging = useRef<{ startY: number; pointerId: number } | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  // Родители передают onClose стрелкой, новой на каждой отрисовке. Эффект
  // панели от неё не зависит: иначе любая перерисовка родителя (звезда
  // «в избранное», ответ базы) снимала и ставила заново inert, а фокус
  // прыгал с кнопки на контейнер панели
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => { onCloseRef.current = onClose })
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

  const isOpen = phase === 'open'
  useEffect(() => {
    if (!isOpen) return
    const el = sheetRef.current
    const stack = sheetStack()
    el?.removeAttribute('inert')
    const active = document.activeElement
    const opener = active instanceof HTMLElement && active !== document.body ? active : null
    const item: SheetItem = { el, opener, trail: ancestry(opener), close: () => onCloseRef.current() }
    stack.open(item)
    // Фокус уходит в панель, а при закрытии возвращается туда, откуда пришёл
    el?.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      // Клавиши слушает только верхняя панель
      if (stack.top() !== item || e.defaultPrevented || e.isComposing) return
      if (e.key === 'Escape') item.close()
      // Tab не выходит за пределы панели: фон под ней всё равно inert
      else if (e.key === 'Tab' && el) trapTab(e, el)
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      // Уходящая панель видна ещё 220 мс, но нажать в ней уже ничего нельзя:
      // второй тап по «Добавить в дневник» записал бы еду дважды
      el?.setAttribute('inert', '')
      stack.close(item)
      // Панель, открытая изнутри этой, наследует её opener: этой панели
      // скоро не будет в DOM, и фокусу некуда было бы вернуться
      for (const other of stack.items()) {
        if (other.opener && el?.contains(other.opener)) {
          other.opener = item.opener
          other.trail = item.trail
        }
      }
      returnFocus(item, stack.top())
    }
  }, [isOpen])

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
  // --drag нужен уходу: анимация sink начинается с того места, где панель
  // отпустили, а не прыгает сначала обратно наверх
  const style = drag > 0
    ? { transform: `translateY(${drag}px)`, transition: 'none', '--drag': `${drag}px` } as CSSProperties
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

/**
 * Вернуть фокус после закрытия. Только если он был в этой панели или
 * потерялся: при смене панелей он уже стоит в следующей, и забирать его
 * оттуда на кнопку за панелью нельзя.
 */
function returnFocus(item: SheetItem, top: SheetItem | undefined) {
  const active = document.activeElement
  const lost = !active || active === document.body
  if (!lost && !item.el?.contains(active)) return
  // До открытия фокуса не было нигде: касание в Safari не фокусирует
  // кнопку. Туда он и возвращается — уводить его некуда и незачем
  if (!item.opener && !top) return
  if (top) {
    // Под уходящей панелью осталась другая — фокус остаётся в ней
    const back = item.opener?.isConnected && top.el?.contains(item.opener) ? item.opener : top.el
    back?.focus({ preventScroll: true })
    return
  }
  if (item.opener?.isConnected && !item.opener.closest('[inert]')) {
    item.opener.focus({ preventScroll: true })
    guardFocus(item.opener, item.trail)
  } else {
    // Открывавшей кнопки больше нет: например, это строка удалённой записи
    rescueFocus(item.trail)
  }
}
