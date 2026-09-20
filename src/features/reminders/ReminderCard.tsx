import { useEffect, useState } from 'react'
import { Glass } from '@/ui/Glass'
import { Pill } from '@/ui/Pill'
import { Chip, ChipRow } from '@/ui/Chip'
import { TextField } from '@/ui/TextField'
import { Icon } from '@/ui/Icon'
import {
  askPermission, getReminders, notificationsSupported, saveReminders,
  type ReminderSettings,
} from './reminders'
import s from './ReminderCard.module.css'

const WATER_STEPS = [0, 1, 2, 3]

/**
 * Напоминания. Честно: без сервера веб-приложение не будит себя само,
 * поэтому они срабатывают, пока дневник открыт или свёрнут. Об этом
 * написано прямо в карточке — лучше знать, чем гадать, почему молчит.
 */
export function ReminderCard() {
  const [st, setSt] = useState<ReminderSettings | null>(null)
  const [perm, setPerm] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  )

  useEffect(() => { void getReminders().then(setSt) }, [])

  if (!st) return null
  const supported = notificationsSupported()

  async function update(patch: Partial<ReminderSettings>) {
    const next = { ...st!, ...patch }
    setSt(next)
    await saveReminders(next)
  }

  async function enable() {
    const p = await askPermission()
    setPerm(p)
    if (p === 'granted') await update({ enabled: true })
  }

  return (
    <Glass>
      <div className={s.head}>
        <span className={s.title}>Напоминания</span>
        <span className={s.hint}>
          {!supported ? 'не поддерживаются' : st.enabled && perm === 'granted' ? 'включены' : 'выключены'}
        </span>
      </div>

      {!supported && (
        <p className={s.note}>
          Этот браузер не показывает уведомления. На iPhone они появляются
          только после установки дневника на домашний экран.
        </p>
      )}

      {supported && !(st.enabled && perm === 'granted') && (
        <>
          <p className={s.note}>
            Дневник напомнит записать еду, выпить воды и взвеситься. Напоминание
            молчит, если дело уже сделано.
          </p>
          {perm === 'denied' ? (
            <p className={`${s.note} ${s.warn}`}>
              Уведомления запрещены в настройках браузера — разрешите их там.
            </p>
          ) : (
            <Pill block variant="ghost" onClick={() => void enable()}>
              <Icon name="bell" size={16} /> Включить
            </Pill>
          )}
        </>
      )}

      {supported && st.enabled && perm === 'granted' && (
        <div className={s.form}>
          <div className={s.row}>
            <div className={s.rowText}>
              <span className={s.rowTitle}>Дневник пуст</span>
              <span className={s.rowHint}>проверить вечером</span>
            </div>
            <TextField value={st.mealAt} onChange={(v) => void update({ mealAt: v })} type="time" compact />
          </div>

          <div className={s.row}>
            <div className={s.rowText}>
              <span className={s.rowTitle}>Вода</span>
              <span className={s.rowHint}>с 9 до 21, каждые</span>
            </div>
            <ChipRow>
              {WATER_STEPS.map((h) => (
                <Chip key={h} active={st.waterEveryH === h} onClick={() => void update({ waterEveryH: h })}>
                  {h === 0 ? 'выкл' : `${h} ч`}
                </Chip>
              ))}
            </ChipRow>
          </div>

          <div className={s.row}>
            <div className={s.rowText}>
              <span className={s.rowTitle}>Взвешивание</span>
              <span className={s.rowHint}>утром, если веса ещё нет</span>
            </div>
            <TextField value={st.weighAt} onChange={(v) => void update({ weighAt: v })} type="time" compact />
          </div>

          <p className={s.note}>
            Работают, пока дневник открыт или свёрнут: фоновых уведомлений
            без сервера у веб-приложения нет.
          </p>
          <Pill block variant="quiet" onClick={() => void update({ enabled: false })}>Выключить</Pill>
        </div>
      )}
    </Glass>
  )
}
