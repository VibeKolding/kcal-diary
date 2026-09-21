import { useEffect, useRef, useState } from 'react'
import { Pill } from '@/ui/Pill'
import { useToast } from '@/ui/Toast'
import { setMeta } from '@/db/db'
import { backupIsStale, exportBackup, lastBackupAt } from '@/features/backup/backup'
import { detectPlatform } from '@/features/install/useInstall'
import { STORAGE_NOTICE_SEEN, backupDoneText, nudgeText, storageNoticeText } from './safetyText'
import { saveErrorText } from './saveError'
import s from './Today.module.css'

/**
 * Сохранение копии с кнопки на главной. Двойное касание открыло бы окно
 * «Поделиться» дважды, а второе браузер отклоняет ошибкой, поэтому
 * повторный вызов, пока первый не кончился, отсекается.
 */
function useSaveCopy() {
  const toast = useToast()
  const busy = useRef(false)

  return async function saveCopy(): Promise<boolean> {
    if (busy.current) return false
    busy.current = true
    try {
      const outcome = await exportBackup()
      const text = backupDoneText(outcome)
      if (text) toast({ text })
      return outcome !== 'cancelled'
    } catch {
      toast({ text: 'Не удалось сохранить копию. Попробуйте ещё раз.' })
      return false
    } finally {
      busy.current = false
    }
  }
}

/**
 * Одноразовая карточка «Где хранится дневник» сразу после анкеты.
 *
 * Что дневник живёт только в телефоне, человек узнавал из строки
 * напоминания — через неделю, когда терять уже было что. Здесь то же
 * самое говорится в первый день, вместе с двумя мерами, которые правда
 * спасают данные: экран «Домой» и копия раз в неделю. Карточка висит,
 * пока не нажато «Понятно»: сохранить копию можно, не закрывая её.
 */
export function StorageNotice() {
  const toast = useToast()
  const saveCopy = useSaveCopy()
  const [installed] = useState(() => detectPlatform() === 'installed')

  return (
    <section className={s.notice} aria-labelledby="storage-notice-title">
      <h2 id="storage-notice-title" className={s.noticeTitle}>Где хранится дневник</h2>
      {storageNoticeText(installed).map((p) => (
        <p key={p} className={s.nudgeText}>{p}</p>
      ))}
      <div className={s.noticeActions}>
        <Pill size="sm" onClick={() => void saveCopy()}>Сохранить копию</Pill>
        <Pill
          size="sm" variant="ghost"
          onClick={() => {
            setMeta(STORAGE_NOTICE_SEEN, true).catch((e: unknown) => toast({ text: saveErrorText(e) }))
          }}
        >
          Понятно
        </Pill>
      </div>
    </section>
  )
}

/**
 * Напоминание о копии там, где человек находится.
 *
 * Копию можно было сделать и раньше — кнопка лежит в профиле. Но чтобы до
 * неё дойти, нужно вспомнить, что она существует, и уйти с экрана, на
 * котором ты только что записал ужин. Поэтому строка появляется прямо
 * здесь и делает копию одним нажатием.
 *
 * Когда её пора показывать, решает backupIsStale(). Исчезает строка сразу
 * после сохранения: постоянная плашка «сделайте копию» перестаёт читаться
 * на третий день. Если окно «Поделиться» закрыли ничего не выбрав, копии
 * нет — и строка остаётся.
 */
export function BackupNudge() {
  const [text, setText] = useState<string | null>(null)
  const saveCopy = useSaveCopy()

  useEffect(() => {
    let alive = true
    void Promise.all([backupIsStale(), lastBackupAt()]).then(([stale, last]) => {
      if (alive) setText(stale ? nudgeText(last) : null)
    })
    return () => { alive = false }
  }, [])

  if (!text) return null

  return (
    <div className={s.nudge}>
      <span className={s.nudgeText}>{text}</span>
      <Pill
        size="sm"
        onClick={async () => {
          if (await saveCopy()) setText(null)
        }}
      >
        Сохранить
      </Pill>
    </div>
  )
}
