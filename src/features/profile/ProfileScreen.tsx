import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Glass } from '@/ui/Glass'
import { Pill } from '@/ui/Pill'
import {
  ACTIVITY_LABELS, GOAL_LABELS, GOAL_RATES, ageFrom, targetsForProfile,
} from '@/domain/targets'
import type { Activity, Goal, Profile, Sex } from '@/domain/types'
import { NumberField, parseNumber } from '@/ui/NumberField'
import { setManualTargets, resetToAutoTargets, updateProfile, wipeEverything } from '@/db/profile'
import { ReminderCard } from '@/features/reminders/ReminderCard'
import { exportCsv } from '@/features/backup/csv'
import { latestWeight } from '@/db/tracking'
import {
  BackupError, backupIsStale, exportBackup, importBackup, lastBackupAt,
  restorePointAt, undoRestore,
} from '@/features/backup/backup'
import { persistState, spaceReport, type PersistState, type SpaceReport } from '@/db/persist'
import { InstallCard } from '@/features/install/InstallCard'
import { useToast } from '@/ui/Toast'
import { WeightCard } from './WeightCard'
import { AboutCard } from './AboutCard'
import { useDraft } from './useDraft'
import { birthDateAfterEdit, checkNormForm, normFormFrom, normValuesFrom } from './norm'
import { exportedText, restoredText } from './restore'
import { useTheme } from '@/app/theme'
import s from './ProfileScreen.module.css'

/** Фокус на кнопку блока. Нужен, когда нажатая кнопка исчезает: иначе
    фокус падает в body, и следующий Tab начинает с начала страницы. */
function focusButton(box: HTMLElement | null, index: number) {
  const buttons = box?.querySelectorAll('button')
  buttons?.[index < 0 ? buttons.length + index : index]?.focus()
}

export function ProfileScreen({ profile }: { profile: Profile }) {
  const { theme, setTheme } = useTheme()
  // Сообщения — тостом: раньше они выводились в карточке копии, и после
  // «Сохранить норму» или «Записать вес» подтверждение оказывалось за экраном
  const toast = useToast()
  const say = (text: string) => toast({ text })

  // Живой запрос: после восстановления из файла вес другой, и базовый
  // обмен для предупреждения о норме должен считаться уже от него
  const latest = useLiveQuery(() => latestWeight(), [])
  const bmr = latest ? targetsForProfile(profile, latest.kg).bmr : null

  const saved = normValuesFrom(profile)
  const norm = useDraft(normFormFrom(saved))
  const check = checkNormForm(norm.draft, saved, bmr)
  const normChanged = check.targetsChanged || check.waterChanged
  const normTitle = useRef<HTMLSpanElement>(null)

  const [wipe, setWipe] = useState(false)
  const wipeBox = useRef<HTMLDivElement>(null)
  const wipeToggled = useRef(false)

  const [stale, setStale] = useState(false)
  const [lastBackup, setLastBackup] = useState<number | null>(null)
  const [persist, setPersist] = useState<PersistState | null>(null)
  const [space, setSpace] = useState<SpaceReport | null>(null)
  const [undoAt, setUndoAt] = useState<number | null>(null)
  // Состояние копии перечитывается после каждого действия с ней
  const [backupTick, setBackupTick] = useState(0)
  const refreshBackup = () => setBackupTick((t) => t + 1)
  const fileRef = useRef<HTMLInputElement>(null)
  const backupActions = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void backupIsStale().then(setStale)
    void lastBackupAt().then(setLastBackup)
    void persistState().then(setPersist)
    void spaceReport().then(setSpace)
    void restorePointAt().then(setUndoAt)
  }, [backupTick])

  // Открыли подтверждение стирания — фокус на безопасную «Оставить»,
  // закрыли — обратно на «Удалить все данные…». Обе последние в блоке.
  useEffect(() => {
    if (!wipeToggled.current) return
    wipeToggled.current = false
    focusButton(wipeBox.current, -1)
  }, [wipe])

  function toggleWipe(next: boolean) {
    wipeToggled.current = true
    setWipe(next)
  }

  /*
   * Вода и стакан — не норма еды. Раньше одна кнопка писала всё через
   * setManualTargets, и смена стакана с 250 на 300 мл молча выключала
   * авторасчёт: вес переставал менять норму калорий. Теперь норма
   * становится ручной, только если правили калории или БЖУ.
   */
  async function saveNorm() {
    const v = check.values
    if (!v || !normChanged) return
    if (check.targetsChanged) {
      await setManualTargets({ kcal: v.kcal, protein: v.protein, fat: v.fat, carbs: v.carbs })
    }
    if (check.waterChanged) {
      await updateProfile({ waterGoalMl: v.water, glassMl: v.glass })
    }
    // Поля приводятся к сохранённому виду («02000» → «2000»), иначе форма
    // осталась бы «тронутой» и перестала бы следить за профилем
    norm.replace(normFormFrom(v))
    if (check.targetsChanged) {
      say(profile.targetsManual ? 'Норма сохранена.' : 'Норма сохранена. Авторасчёт отключён.')
    } else if (v.water !== saved.water && !profile.targetsManual) {
      say('Сохранено. При следующем взвешивании вода снова посчитается от веса.')
    } else {
      say('Сохранено.')
    }
  }

  async function backToAuto() {
    const w = await latestWeight()
    if (!w) {
      say('Сначала запишите вес: норма считается от него.')
      return
    }
    // Черновик сбрасывается, чтобы поля пошли за пересчитанной нормой
    norm.reset()
    await resetToAutoTargets(w.kg)
    // Кнопка сейчас исчезнет, а «Сохранить норму» погашена: нечего
    // сохранять. Фокус встаёт на заголовок карточки, следующий Tab — в поля.
    normTitle.current?.focus()
    say('Норма пересчитана по анкете.')
  }

  async function doExport() {
    try {
      const text = exportedText(await exportBackup())
      if (text) say(text)
    } catch {
      toast({ text: 'Не получилось сохранить копию. Попробуйте ещё раз.', duration: 6000 })
    }
    refreshBackup()
  }

  async function doExportCsv() {
    try {
      const text = exportedText(await exportCsv(), 'Таблица')
      if (text) say(text)
    } catch {
      toast({ text: 'Не получилось сохранить таблицу. Попробуйте ещё раз.', duration: 6000 })
    }
  }

  async function doImport(file: File) {
    try {
      const res = await importBackup(file)
      // Прежний дневник не поместился в точку возврата — отменить нельзя,
      // и человек должен узнать об этом сейчас, а не когда захочет вернуть
      toast(res.undo === 'too-big'
        ? {
            text: `Восстановлено: ${restoredText(res)}. Прежний дневник был слишком большим, вернуть его не получится.`,
            duration: 8000,
          }
        : { text: `Восстановлено: ${restoredText(res)}.` })
    } catch (e) {
      toast({
        text: e instanceof BackupError ? e.message : 'Не удалось прочитать файл.',
        duration: 6000,
      })
    }
    refreshBackup()
  }

  async function doUndo() {
    try {
      const r = await undoRestore()
      // Кнопка «Вернуть как было» исчезнет — фокус на «Восстановить из файла»
      focusButton(backupActions.current, 1)
      say(`Вернули как было: ${restoredText(r)}.`)
    } catch (e) {
      toast({
        text: e instanceof BackupError ? e.message : 'Не получилось вернуть.',
        duration: 6000,
      })
    }
    refreshBackup()
  }

  return (
    <div className={s.screen}>
      <h1 className={s.title}>Профиль</h1>

      <InstallCard />

      <Glass>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>Тема</span>
        </div>
        <div className={s.themeRow}>
          {/* Выбранная тема видна не только цветом рамки: aria-pressed
              говорит о ней и скринридеру */}
          <button
            type="button" aria-pressed={theme === 'dark'}
            className={`${s.themeCard} ${theme === 'dark' ? s.themeOn : ''}`}
            onClick={() => { setTheme('dark'); void updateProfile({ theme: 'dark' }) }}
          >
            <div className={`${s.swatch} ${s.swatchDark}`}>
              <span className={s.swatchDot} />
              <span className={s.swatchChip} />
            </div>
            <div className={s.themeName}>Тёмное стекло</div>
          </button>
          <button
            type="button" aria-pressed={theme === 'light'}
            className={`${s.themeCard} ${theme === 'light' ? s.themeOn : ''}`}
            onClick={() => { setTheme('light'); void updateProfile({ theme: 'light' }) }}
          >
            <div className={`${s.swatch} ${s.swatchLight}`}>
              <span className={s.swatchDot} />
              <span className={s.swatchChip} />
            </div>
            <div className={s.themeName}>Светлое стекло</div>
          </button>
        </div>
      </Glass>

      <Glass>
        <div className={s.cardHead}>
          <span ref={normTitle} tabIndex={-1} className={s.cardTitle}>Норма на день</span>
          <span className={s.cardHint}>
            {profile.targetsManual ? 'задана вручную' : 'авторасчёт'}
          </span>
        </div>

        <div className={s.quad}>
          <NumberField label="Калории" size="md" value={norm.draft.kcal}
            onChange={(v) => norm.set('kcal', v)} error={check.errors.kcal} />
          <NumberField label="Вода, мл" size="md" value={norm.draft.water}
            onChange={(v) => norm.set('water', v)} error={check.errors.water} />
          <NumberField label="Белки, г" size="md" value={norm.draft.protein}
            onChange={(v) => norm.set('protein', v)} error={check.errors.protein} />
          <NumberField label="Жиры, г" size="md" value={norm.draft.fat}
            onChange={(v) => norm.set('fat', v)} error={check.errors.fat} />
          <NumberField label="Углеводы, г" size="md" value={norm.draft.carbs}
            onChange={(v) => norm.set('carbs', v)} error={check.errors.carbs} />
          <NumberField label="Стакан, мл" size="md" value={norm.draft.glass}
            onChange={(v) => norm.set('glass', v)} error={check.errors.glass} />
        </div>

        {check.belowBmr && bmr !== null && (
          <p className={`${s.note} ${s.warn}`} style={{ marginTop: 'var(--s3)' }}>
            Это ниже базового обмена ({bmr} ккал) — столько организм тратит
            в покое. Такую норму лучше согласовать с врачом.
          </p>
        )}
        {check.overKcal !== null && (
          <p className={`${s.note} ${s.warn}`} style={{ marginTop: 'var(--s3)' }}>
            Белки и жиры сами дают {check.overKcal} ккал — больше нормы калорий.
            Уменьшите их или поднимите норму.
          </p>
        )}

        <div className={s.actions} style={{ marginTop: 'var(--s4)' }}>
          <Pill block disabled={!check.values || !normChanged} onClick={saveNorm}>
            Сохранить норму
          </Pill>
          {profile.targetsManual && (
            <Pill block variant="ghost" onClick={backToAuto}>
              Вернуть авторасчёт по анкете
            </Pill>
          )}
        </div>
      </Glass>

      <WeightCard profile={profile} onSaved={say} />

      <ProfileForm profile={profile} onSaved={say} />

      <ReminderCard />

      <Glass accent={stale}>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>Резервная копия</span>
          <span className={s.cardHint}>
            {lastBackup
              ? new Date(lastBackup).toLocaleDateString('ru-RU')
              : 'ещё не делали'}
          </span>
        </div>

        <p className={`${s.note} ${stale ? s.warn : ''}`} style={{ marginBottom: 'var(--s4)' }}>
          {stale
            ? `${lastBackup === null ? 'Копии ещё не было.' : 'Копии больше недели нет.'} Данные хранятся только в этом браузере — очистка сайта сотрёт дневник без возможности восстановления.`
            : 'Данные хранятся только на этом устройстве. Файл копии — единственный способ перенести дневник на другой телефон.'}
        </p>

        {/* Честная строка о том, переживут ли данные нехватку места.
            Говорим не «включите настройку», а что делать: пометку даёт
            только вынесенное на домашний экран приложение. */}
        {persist === 'granted' && (
          <p className={`${s.note} ${s.ok}`} style={{ marginBottom: 'var(--s4)' }}>
            Хранилище защищено: система не станет вычищать дневник, когда на
            телефоне закончится место.
          </p>
        )}
        {persist === 'denied' && (
          <p className={`${s.note} ${s.warn}`} style={{ marginBottom: 'var(--s4)' }}>
            Браузер не согласился держать данные постоянно: при нехватке места
            он вправе их вычистить. Сохраняйте копию почаще.
          </p>
        )}
        {persist === 'skipped' && (
          <p className={s.note} style={{ marginBottom: 'var(--s4)' }}>
            Дневник открыт во вкладке браузера. Вынесите его на домашний экран —
            тогда система перестанет считать данные временными и не тронет их
            при нехватке места.
          </p>
        )}
        {space?.tight && (
          <p className={`${s.note} ${s.warn}`} style={{ marginBottom: 'var(--s4)' }}>
            На устройстве почти не осталось места ({Math.round(space.free / 1024 / 1024)} МБ).
            Освободите его и сохраните копию: при нехватке места система чистит
            данные сайтов в первую очередь.
          </p>
        )}

        <div ref={backupActions} className={s.actions}>
          {/* «Сохранить», а не «Скачать»: на телефоне копия уходит через окно
              «Поделиться» — в iCloud Drive, Google Drive, Telegram */}
          <Pill block onClick={doExport}>Сохранить копию</Pill>
          <Pill block variant="ghost" onClick={() => fileRef.current?.click()}>
            Восстановить из файла
          </Pill>
          {undoAt !== null && (
            <Pill block variant="ghost" onClick={doUndo}>
              Вернуть как было (до {new Date(undoAt).toLocaleDateString('ru-RU')})
            </Pill>
          )}
          <Pill block variant="quiet" onClick={doExportCsv}>
            Сохранить таблицу CSV
          </Pill>
          <input
            ref={fileRef} className={s.hidden} type="file" accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
              e.target.value = ''
            }}
          />
        </div>
      </Glass>
      <Glass>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>Стереть всё</span>
        </div>
        <p className={s.note} style={{ marginBottom: 'var(--s3)' }}>
          Дневник, продукты, рецепты, вес и настройки на этом устройстве. Резервная
          копия, если вы её сохраняли, не пострадает: она лежит отдельно.
        </p>
        <div ref={wipeBox}>
          {wipe ? (
            <div className={s.actions}>
              <Pill block className={s.dangerBtn} onClick={async () => { await wipeEverything(); location.replace('/') }}>
                Да, удалить безвозвратно
              </Pill>
              <Pill block variant="ghost" onClick={() => toggleWipe(false)}>Оставить</Pill>
            </div>
          ) : (
            <Pill block variant="ghost" onClick={() => toggleWipe(true)}>Удалить все данные…</Pill>
          )}
        </div>
      </Glass>

      <AboutCard />

    </div>
  )
}


/**
 * Редактор анкеты.
 *
 * Цель и активность меняются со временем, а от них зависит вся норма —
 * поэтому анкета должна быть изменяемой, а не только для чтения.
 */
function ProfileForm({
  profile, onSaved,
}: { profile: Profile; onSaved: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const form = useDraft<{
    sex: Sex; age: string; height: string; activity: Activity; goal: Goal; rate: number
  }>({
    sex: profile.sex,
    age: String(ageFrom(profile.birthDate)),
    height: String(profile.heightCm),
    activity: profile.activity,
    goal: profile.goal,
    rate: profile.ratePerWeek,
  })
  const { sex, age, height, activity, goal, rate } = form.draft
  // «Изменить» и «Отмена» стоят на одном месте и сменяют друг друга:
  // после переключения фокус переходит на ту, что появилась
  const headBtn = useRef<HTMLButtonElement>(null)
  const toggled = useRef(false)

  useEffect(() => {
    if (!toggled.current) return
    toggled.current = false
    headBtn.current?.focus()
  }, [open])

  function toggle(next: boolean) {
    // Открываем с сохранёнными значениями: брошенная в прошлый раз правка
    // не должна всплыть через неделю
    if (next) form.reset()
    toggled.current = true
    setOpen(next)
  }

  const ageValue = parseNumber(age)
  const heightValue = parseNumber(height)
  const ageError = ageValue !== null && (ageValue < 14 || ageValue > 100)
    ? 'От 14 до 100 лет' : null
  const heightError = heightValue !== null && (heightValue < 100 || heightValue > 250)
    ? 'От 100 до 250 см' : null
  const valid = ageValue !== null && heightValue !== null && !ageError && !heightError

  function pickGoal(next: Goal) {
    form.set('goal', next)
    const rates = GOAL_RATES[next]
    if (!rates.includes(rate)) form.set('rate', rates[Math.min(1, rates.length - 1)]!)
  }

  async function save() {
    if (!valid) return
    await updateProfile({
      sex,
      birthDate: birthDateAfterEdit(profile.birthDate, ageValue),
      heightCm: heightValue,
      activity,
      goal,
      ratePerWeek: goal === 'keep' ? 0 : rate,
    })
    // Норму пересчитываем от актуального веса, если её не задавали руками
    const w = await latestWeight()
    if (w && !profile.targetsManual) await resetToAutoTargets(w.kg)
    toggle(false)
    onSaved(profile.targetsManual
      ? 'Анкета сохранена. Норма задана вручную, поэтому не изменилась.'
      : w
        ? 'Анкета сохранена, норма пересчитана.'
        // Без взвешиваний (копия без веса) пересчитывать не от чего —
        // и писать «пересчитана» было бы неправдой
        : 'Анкета сохранена. Норма пересчитается, когда вы запишете вес.')
  }

  if (!open) {
    return (
      <Glass>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>Анкета</span>
          <button ref={headBtn} className={s.editBtn} onClick={() => toggle(true)}>Изменить</button>
        </div>
        <div className={s.rows}>
          <div className={s.row}>
            <span className={s.rowLabel}>Пол</span>
            <span className={s.rowValue}>{profile.sex === 'male' ? 'Мужской' : 'Женский'}</span>
          </div>
          <div className={s.row}>
            <span className={s.rowLabel}>Возраст</span>
            <span className={`${s.rowValue} num`}>{ageFrom(profile.birthDate)} лет</span>
          </div>
          <div className={s.row}>
            <span className={s.rowLabel}>Рост</span>
            <span className={`${s.rowValue} num`}>{profile.heightCm} см</span>
          </div>
          <div className={s.row}>
            <span className={s.rowLabel}>Активность</span>
            <span className={s.rowValue}>{ACTIVITY_LABELS[profile.activity].title}</span>
          </div>
          <div className={s.row}>
            <span className={s.rowLabel}>Цель</span>
            <span className={s.rowValue}>
              {GOAL_LABELS[profile.goal].title}
              {profile.goal !== 'keep' && ` · ${profile.ratePerWeek} кг/нед`}
            </span>
          </div>
        </div>
      </Glass>
    )
  }

  return (
    <Glass accent>
      <div className={s.cardHead}>
        <span className={s.cardTitle}>Анкета</span>
        <button ref={headBtn} className={s.editBtn} onClick={() => toggle(false)}>Отмена</button>
      </div>

      <div className={s.editForm}>
        <div className={s.segment} role="radiogroup" aria-label="Пол">
          <button
            type="button" role="radio" aria-checked={sex === 'male'}
            className={`${s.segItem} ${sex === 'male' ? s.segItemOn : ''}`}
            onClick={() => form.set('sex', 'male')}
          >Мужской</button>
          <button
            type="button" role="radio" aria-checked={sex === 'female'}
            className={`${s.segItem} ${sex === 'female' ? s.segItemOn : ''}`}
            onClick={() => form.set('sex', 'female')}
          >Женский</button>
        </div>

        <div className={s.quad}>
          <NumberField label="Возраст" unit="лет" value={age}
            onChange={(v) => form.set('age', v)} error={ageError} />
          <NumberField label="Рост" unit="см" value={height}
            onChange={(v) => form.set('height', v)} error={heightError} />
        </div>

        <div className={s.field}>
          <span className={s.label}>Активность</span>
          <div className={s.optionList} role="radiogroup" aria-label="Активность">
            {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((k) => (
              <button
                key={k} type="button" role="radio" aria-checked={activity === k}
                className={`${s.option} ${activity === k ? s.optionOn : ''}`}
                onClick={() => form.set('activity', k)}
              >{ACTIVITY_LABELS[k].title}</button>
            ))}
          </div>
        </div>

        <div className={s.field}>
          <span className={s.label}>Цель</span>
          <div className={s.optionList} role="radiogroup" aria-label="Цель">
            {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
              <button
                key={g} type="button" role="radio" aria-checked={goal === g}
                className={`${s.option} ${goal === g ? s.optionOn : ''}`}
                onClick={() => pickGoal(g)}
              >{GOAL_LABELS[g].title}</button>
            ))}
          </div>
        </div>

        {goal !== 'keep' && (
          <div className={s.field}>
            <span className={s.label}>Темп, кг в неделю</span>
            <div className={s.optionList} role="radiogroup" aria-label="Темп, кг в неделю">
              {GOAL_RATES[goal].map((r) => (
                <button
                  key={r} type="button" role="radio" aria-checked={rate === r}
                  className={`${s.option} ${rate === r ? s.optionOn : ''} num`}
                  onClick={() => form.set('rate', r)}
                >{r}</button>
              ))}
            </div>
          </div>
        )}

        <Pill block disabled={!valid} onClick={save}>Сохранить анкету</Pill>
      </div>
    </Glass>
  )
}
