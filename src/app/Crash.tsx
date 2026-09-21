import { useEffect, useState } from 'react'
import { restorePointAt, undoRestore, BackupError } from '@/features/backup/backup'
import { Glass } from '@/ui/Glass'
import { Pill } from '@/ui/Pill'
import { Icon } from '@/ui/Icon'
import { describeError, errorCode } from './errors'
import s from './Crash.module.css'

/**
 * Экран «не открылось»: ошибка запуска базы или отрисовки.
 *
 * Одно главное действие — перезагрузить. Если недавно восстанавливали
 * копию из файла, рядом «Вернуть как было»: битая копия была одним из
 * путей к белому экрану, а кнопка отката жила в профиле, куда из
 * упавшего приложения не попасть.
 */
export function Crash({ error, componentStack }: { error: unknown; componentStack?: string | null }) {
  const { kind, title, text } = describeError(error)
  const code = errorCode(error, componentStack)
  const [canUndo, setCanUndo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [undoError, setUndoError] = useState<string | null>(null)

  useEffect(() => {
    // Откат помогает, только когда упала отрисовка данных. Недогруженному
    // чанку, сети и запрету хранилища он ничем не поможет — только собьёт.
    if (kind !== 'other') return
    let alive = true
    // База может быть той самой причиной — тогда отката просто нет
    restorePointAt()
      .then((at) => { if (alive) setCanUndo(at !== null) })
      .catch(() => {})
    return () => { alive = false }
  }, [kind])

  const undo = async () => {
    setBusy(true)
    setUndoError(null)
    try {
      await undoRestore()
      location.reload()
    } catch (e) {
      setBusy(false)
      setUndoError(e instanceof BackupError ? e.message : 'Не получилось вернуть данные. Перезагрузите страницу и попробуйте из профиля.')
    }
  }

  // Хранилище и сеть чинятся снаружи — после этого «попробовать снова»;
  // остальное лечится перезагрузкой
  const retry = kind === 'storage' || kind === 'quota' || kind === 'network'
    ? 'Попробовать снова'
    : 'Перезагрузить'

  return (
    <div className={s.screen} role="alert">
      <Glass padding="lg" className={s.card}>
        <span className={s.icon}><Icon name="warn" size={28} /></span>
        <h1 className={s.title}>{title}</h1>
        <p className={s.text}>{text}</p>
        {canUndo && (
          <p className={s.text}>
            Если это случилось после восстановления из файла, данные можно
            вернуть такими, какими они были до него.
          </p>
        )}
        {undoError && <p className={s.error}>{undoError}</p>}
        <div className={s.actions}>
          <Pill block onClick={() => location.reload()}>{retry}</Pill>
          {canUndo && (
            <Pill block variant="ghost" disabled={busy} onClick={() => void undo()}>
              Вернуть как было
            </Pill>
          )}
        </div>
        {/* Мелко и в конце: человеку не нужен, но по снимку экрана с
            телефона только по нему и видно, что сломалось */}
        <p className={s.code}>Для разработчика: {code}</p>
      </Glass>
    </div>
  )
}
