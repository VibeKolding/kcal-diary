import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type FocusEvent, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { leaveToast } from './focus'
import s from './Toast.module.css'

interface ToastInput {
  text: string
  /** Одно действие, обычно «Отменить». Тост с действием живёт дольше. */
  action?: { label: string; onClick: () => void | Promise<void> }
  /** Сколько держать, мс. По умолчанию 3 с без действия и 5 с с ним */
  duration?: number
}

interface Toast extends ToastInput { id: number }

/** После паузы тост не исчезает мгновенно: дать дочитать и дотянуться */
const RESUME_MIN_MS = 1500

const Ctx = createContext<((t: ToastInput) => void) | null>(null)

/**
 * Одно короткое сообщение внизу экрана, над таб-баром. Новое заменяет
 * старое: очередь из тостов — это уже не «короткое сообщение».
 *
 * Пока тост под пальцем, курсором или в фокусе, отсчёт стоит. Иначе
 * «Отменить» после удаления не успеть нажать ни с клавиатуры, ни со
 * скринридером: пять секунд уходят на то, чтобы до него добраться.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  const shownId = useRef<number | null>(null)
  // Остаток времени и момент, с которого он тает, — для паузы
  const left = useRef(0)
  const since = useRef(0)
  const held = useRef({ pointer: false, focus: false })
  // Откуда фокус пришёл на кнопку тоста: туда он вернётся, когда тост уйдёт
  const cameFrom = useRef<HTMLElement | null>(null)

  const hide = useCallback((id: number) => {
    if (shownId.current !== id) return
    clearTimeout(timer.current)
    shownId.current = null
    // Кнопка сейчас исчезнет вместе с фокусом на ней — фокус уводим заранее
    const active = document.activeElement
    if (active && host.current?.contains(active)) leaveToast(active, cameFrom.current)
    cameFrom.current = null
    setToast((cur) => (cur?.id === id ? null : cur))
  }, [])

  const arm = useCallback((id: number, ms: number) => {
    clearTimeout(timer.current)
    left.current = ms
    since.current = Date.now()
    timer.current = window.setTimeout(() => hide(id), ms)
  }, [hide])

  const show = useCallback((t: ToastInput) => {
    const id = Date.now()
    shownId.current = id
    held.current = { pointer: false, focus: false }
    cameFrom.current = null
    setToast({ ...t, id })
    arm(id, t.duration ?? (t.action ? 5000 : 3000))
  }, [arm])

  useEffect(() => () => clearTimeout(timer.current), [])

  const hold = (kind: 'pointer' | 'focus', on: boolean) => {
    const id = shownId.current
    if (id === null) return
    const was = held.current.pointer || held.current.focus
    held.current[kind] = on
    const now = held.current.pointer || held.current.focus
    if (!was && now) {
      clearTimeout(timer.current)
      left.current -= Date.now() - since.current
    } else if (was && !now) {
      arm(id, Math.max(left.current, RESUME_MIN_MS))
    }
  }

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const prev = e.relatedTarget
    if (prev instanceof HTMLElement && !e.currentTarget.contains(prev)) cameFrom.current = prev
    hold('focus', true)
  }
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
    hold('focus', false)
  }

  const act = async () => {
    if (!toast?.action) return
    const { action } = toast
    hide(toast.id)
    await action.onClick()
  }

  return (
    <Ctx.Provider value={show}>
      {children}
      {createPortal(
        <div ref={host} className={s.host} role="status" aria-live="polite">
          {toast && (
            <div
              key={toast.id} className={s.toast}
              onPointerEnter={() => hold('pointer', true)}
              onPointerLeave={() => hold('pointer', false)}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <span className={s.text}>{toast.text}</span>
              {/* По метке data-toast-action панель находит «Отменить», когда
                  кнопки, с которой её открыли, больше нет (src/ui/focus.ts) */}
              {toast.action && (
                <button
                  type="button"
                  className={`${s.action} pressable`}
                  data-toast-action=""
                  onClick={() => void act()}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  )
}

export function useToast(): (t: ToastInput) => void {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast вызван вне ToastProvider')
  return ctx
}
