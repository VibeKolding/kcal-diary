import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import s from './Toast.module.css'

interface ToastInput {
  text: string
  /** Одно действие, обычно «Отменить». Тост с действием живёт дольше. */
  action?: { label: string; onClick: () => void | Promise<void> }
  /** Сколько держать, мс. По умолчанию 3 с без действия и 5 с с ним */
  duration?: number
}

interface Toast extends ToastInput { id: number }

const Ctx = createContext<((t: ToastInput) => void) | null>(null)

/**
 * Одно короткое сообщение внизу экрана, над таб-баром. Новое заменяет
 * старое: очередь из тостов — это уже не «короткое сообщение».
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef(0)

  const show = useCallback((t: ToastInput) => {
    clearTimeout(timer.current)
    const id = Date.now()
    setToast({ ...t, id })
    timer.current = window.setTimeout(
      () => setToast((cur) => (cur?.id === id ? null : cur)),
      t.duration ?? (t.action ? 5000 : 3000),
    )
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  const act = async () => {
    if (!toast?.action) return
    clearTimeout(timer.current)
    setToast(null)
    await toast.action.onClick()
  }

  return (
    <Ctx.Provider value={show}>
      {children}
      {createPortal(
        <div className={s.host} role="status" aria-live="polite">
          {toast && (
            <div key={toast.id} className={s.toast}>
              <span className={s.text}>{toast.text}</span>
              {toast.action && (
                <button className={`${s.action} pressable`} onClick={() => void act()}>
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
