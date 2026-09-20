import { useEffect, useRef, useState } from 'react'
import { Glass } from '@/ui/Glass'
import { Pill } from '@/ui/Pill'
import {
  ACTIVITY_LABELS, GOAL_LABELS, GOAL_RATES, ageFrom, birthDateFromAge,
} from '@/domain/targets'
import type { Activity, Goal, Profile } from '@/domain/types'
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
import { WeightCard } from './WeightCard'
import { AboutCard } from './AboutCard'
import { useTheme } from '@/app/theme'
import s from './ProfileScreen.module.css'

export function ProfileScreen({ profile }: { profile: Profile }) {
  const { theme, setTheme } = useTheme()

  const [kcal, setKcal] = useState(String(profile.targets.kcal))
  const [protein, setProtein] = useState(String(profile.targets.protein))
  const [fat, setFat] = useState(String(profile.targets.fat))
  const [carbs, setCarbs] = useState(String(profile.targets.carbs))
  const [water, setWater] = useState(String(profile.waterGoalMl))
  const [glass, setGlass] = useState(String(profile.glassMl ?? 250))
  const [wipe, setWipe] = useState(false)

  useEffect(() => {
    setKcal(String(profile.targets.kcal))
    setProtein(String(profile.targets.protein))
    setFat(String(profile.targets.fat))
    setCarbs(String(profile.targets.carbs))
    setWater(String(profile.waterGoalMl))
    setGlass(String(profile.glassMl ?? 250))
  }, [profile])

  const [stale, setStale] = useState(false)
  const [lastBackup, setLastBackup] = useState<number | null>(null)
  const [persist, setPersist] = useState<PersistState | null>(null)
  const [space, setSpace] = useState<SpaceReport | null>(null)
  const [undoAt, setUndoAt] = useState<number | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void backupIsStale().then(setStale)
    void lastBackupAt().then(setLastBackup)
    void persistState().then(setPersist)
    void spaceReport().then(setSpace)
    void restorePointAt().then(setUndoAt)
  }, [message])

  async function saveTargets() {
    await setManualTargets({
      kcal: Number(kcal) || profile.targets.kcal,
      protein: Number(protein) || 0,
      fat: Number(fat) || 0,
      carbs: Number(carbs) || 0,
    })
    await updateProfile({
      waterGoalMl: Number(water) || profile.waterGoalMl,
      glassMl: Math.min(1000, Math.max(50, Number(glass) || 250)),
    })
    setMessage({ text: 'Норма сохранена. Авторасчёт отключён.' })
  }

  async function backToAuto() {
    const w = await latestWeight()
    if (!w) return
    await resetToAutoTargets(w.kg)
    setMessage({ text: 'Норма пересчитана по анкете.' })
  }

  async function doExport() {
    await exportBackup()
    setMessage({ text: 'Копия сохранена в загрузки.' })
  }

  async function doImport(file: File) {
    try {
      const res = await importBackup(file)
      setMessage({
        text: `Восстановлено: ${res.entries} записей, ${res.foods} продуктов, ${res.weights} взвешиваний.`,
      })
    } catch (e) {
      setMessage({
        text: e instanceof BackupError ? e.message : 'Не удалось прочитать файл.',
        error: true,
      })
    }
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
          <button
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
          <span className={s.cardTitle}>Норма на день</span>
          <span className={s.cardHint}>
            {profile.targetsManual ? 'задана вручную' : 'авторасчёт'}
          </span>
        </div>

        <div className={s.quad}>
          <NumberField label="Калории" size="md" value={kcal} onChange={setKcal} />
          <NumberField label="Вода, мл" size="md" value={water} onChange={setWater} />
          <NumberField label="Белки, г" size="md" value={protein} onChange={setProtein} />
          <NumberField label="Жиры, г" size="md" value={fat} onChange={setFat} />
          <NumberField label="Углеводы, г" size="md" value={carbs} onChange={setCarbs} />
          <NumberField label="Стакан, мл" size="md" value={glass} onChange={setGlass} />
        </div>

        <div className={s.actions} style={{ marginTop: 'var(--s4)' }}>
          <Pill block onClick={saveTargets}>Сохранить норму</Pill>
          {profile.targetsManual && (
            <Pill block variant="ghost" onClick={backToAuto}>
              Вернуть авторасчёт по анкете
            </Pill>
          )}
        </div>
      </Glass>

      <WeightCard profile={profile} onSaved={(text) => setMessage({ text })} />

      <ProfileForm profile={profile} onSaved={(text) => setMessage({ text })} />

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
            ? 'Копии больше недели нет. Данные хранятся только в этом браузере — очистка сайта сотрёт дневник без возможности восстановления.'
            : 'Данные хранятся только на этом устройстве. Скачанный файл — единственный способ перенести дневник на другой телефон.'}
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
            Освободите его и скачайте копию: при нехватке места система чистит
            данные сайтов в первую очередь.
          </p>
        )}

        <div className={s.actions}>
          <Pill block onClick={doExport}>Скачать копию</Pill>
          <Pill block variant="ghost" onClick={() => fileRef.current?.click()}>
            Восстановить из файла
          </Pill>
          {undoAt !== null && (
            <Pill block variant="ghost" onClick={async () => {
              try {
                const r = await undoRestore()
                setMessage({ text: `Вернули как было: ${r.entries} записей.` })
              } catch (e) {
                setMessage({ text: e instanceof BackupError ? e.message : 'Не получилось вернуть.', error: true })
              }
            }}>
              Вернуть как было (до {new Date(undoAt).toLocaleDateString('ru-RU')})
            </Pill>
          )}
          <Pill block variant="quiet" onClick={async () => { await exportCsv(); setMessage({ text: 'Таблица сохранена в загрузки.' }) }}>
            Скачать таблицу CSV
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

        {message && (
          <p className={`${s.note} ${message.error ? s.warn : s.ok}`} style={{ marginTop: 'var(--s3)' }}>
            {message.text}
          </p>
        )}
      </Glass>
      <Glass>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>Стереть всё</span>
        </div>
        <p className={s.note} style={{ marginBottom: 'var(--s3)' }}>
          Дневник, продукты, рецепты, вес и настройки на этом устройстве. Резервная
          копия, если вы её скачали, останется в загрузках.
        </p>
        {wipe ? (
          <div className={s.actions}>
            <Pill block className={s.dangerBtn} onClick={async () => { await wipeEverything(); location.replace('/') }}>
              Да, удалить безвозвратно
            </Pill>
            <Pill block variant="ghost" onClick={() => setWipe(false)}>Оставить</Pill>
          </div>
        ) : (
          <Pill block variant="ghost" onClick={() => setWipe(true)}>Удалить все данные…</Pill>
        )}
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
  const [age, setAge] = useState(String(ageFrom(profile.birthDate)))
  const [height, setHeight] = useState(String(profile.heightCm))
  const [activity, setActivity] = useState<Activity>(profile.activity)
  const [goal, setGoal] = useState<Goal>(profile.goal)
  const [rate, setRate] = useState(profile.ratePerWeek)
  const [sex, setSex] = useState(profile.sex)

  useEffect(() => {
    setAge(String(ageFrom(profile.birthDate)))
    setHeight(String(profile.heightCm))
    setActivity(profile.activity)
    setGoal(profile.goal)
    setRate(profile.ratePerWeek)
    setSex(profile.sex)
  }, [profile])

  const ageValue = parseNumber(age)
  const heightValue = parseNumber(height)
  const ageError = ageValue !== null && (ageValue < 14 || ageValue > 100)
    ? 'От 14 до 100 лет' : null
  const heightError = heightValue !== null && (heightValue < 100 || heightValue > 250)
    ? 'От 100 до 250 см' : null
  const valid = ageValue !== null && heightValue !== null && !ageError && !heightError

  function pickGoal(next: Goal) {
    setGoal(next)
    const rates = GOAL_RATES[next]
    if (!rates.includes(rate)) setRate(rates[Math.min(1, rates.length - 1)]!)
  }

  async function save() {
    if (!valid) return
    await updateProfile({
      sex,
      birthDate: birthDateFromAge(ageValue),
      heightCm: heightValue,
      activity,
      goal,
      ratePerWeek: goal === 'keep' ? 0 : rate,
    })
    // Норму пересчитываем от актуального веса, если её не задавали руками
    const w = await latestWeight()
    if (w && !profile.targetsManual) await resetToAutoTargets(w.kg)
    setOpen(false)
    onSaved(profile.targetsManual
      ? 'Анкета сохранена. Норма задана вручную, поэтому не изменилась.'
      : 'Анкета сохранена, норма пересчитана.')
  }

  if (!open) {
    return (
      <Glass>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>Анкета</span>
          <button className={s.editBtn} onClick={() => setOpen(true)}>Изменить</button>
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
        <button className={s.editBtn} onClick={() => setOpen(false)}>Отмена</button>
      </div>

      <div className={s.editForm}>
        <div className={s.segment} role="radiogroup" aria-label="Пол">
          <button
            type="button" role="radio" aria-checked={sex === 'male'}
            className={`${s.segItem} ${sex === 'male' ? s.segItemOn : ''}`}
            onClick={() => setSex('male')}
          >Мужской</button>
          <button
            type="button" role="radio" aria-checked={sex === 'female'}
            className={`${s.segItem} ${sex === 'female' ? s.segItemOn : ''}`}
            onClick={() => setSex('female')}
          >Женский</button>
        </div>

        <div className={s.quad}>
          <NumberField label="Возраст" unit="лет" value={age} onChange={setAge} error={ageError} />
          <NumberField label="Рост" unit="см" value={height} onChange={setHeight} error={heightError} />
        </div>

        <div className={s.field}>
          <span className={s.label}>Активность</span>
          <div className={s.optionList} role="radiogroup" aria-label="Активность">
            {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((k) => (
              <button
                key={k} type="button" role="radio" aria-checked={activity === k}
                className={`${s.option} ${activity === k ? s.optionOn : ''}`}
                onClick={() => setActivity(k)}
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
            <div className={s.optionList}>
              {GOAL_RATES[goal].map((r) => (
                <button
                  key={r} type="button"
                  className={`${s.option} ${rate === r ? s.optionOn : ''} num`}
                  onClick={() => setRate(r)}
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
