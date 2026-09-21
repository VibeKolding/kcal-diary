import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Glass } from '@/ui/Glass'
import { Pill } from '@/ui/Pill'
import { NumberField, parseNumber } from '@/ui/NumberField'
import type { Profile, WeightRecord } from '@/domain/types'
import { humanDay, dayKey } from '@/domain/dates'
import { goalForecast, humanWeeks } from '@/domain/weight'
import { putWeight, weightHistory } from '@/db/tracking'
import { db } from '@/db/db'
import { resetToAutoTargets, updateProfile } from '@/db/profile'
import { tap } from '@/ui/haptic'
import { CountUp } from '@/ui/CountUp'
import s from './WeightCard.module.css'

/** Обхват в сантиметрах: ловим опечатку вроде «855» вместо «85,5» */
function girthError(raw: string): string | null {
  const n = parseNumber(raw)
  return n !== null && (n < 30 || n > 250) ? 'От 30 до 250 см' : null
}

/**
 * Вес живёт рядом с анкетой: это такой же факт о человеке, как рост и
 * возраст, и именно от него пересчитывается норма. График веса намеренно
 * остался в «Отчётах» — там ему место среди остальной обратной связи,
 * а профиль остаётся экраном настроек.
 */
export function WeightCard({
  profile, onSaved,
}: { profile: Profile; onSaved: (text: string) => void }) {
  // Живые запросы: история меняется не только отсюда. После «Восстановить
  // из файла» и «Вернуть как было» карточка раньше показывала прежний вес
  // вперемешку с новой целью, пока не уйти с экрана.
  const loaded = useLiveQuery(() => weightHistory(180), [])
  const history = loaded ?? []
  // «За всё время» — от самого первого взвешивания, а не от первого из 180
  // последних: после полугода ежедневных записей начало выпадало из окна
  const first = useLiveQuery(() => db.weights.orderBy('date').first(), [])
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [target, setTarget] = useState(profile.targetWeightKg ? String(profile.targetWeightKg) : '')
  const [girths, setGirths] = useState(false)
  const [waist, setWaist] = useState('')
  const [chest, setChest] = useState('')
  const [hips, setHips] = useState('')
  const girthsBox = useRef<HTMLDivElement>(null)

  // Кнопка «+ обхваты» исчезает при нажатии — фокус переходит в первое поле
  useEffect(() => {
    if (girths) girthsBox.current?.querySelector('input')?.focus()
  }, [girths])
  useEffect(() => {
    setTarget(profile.targetWeightKg ? String(profile.targetWeightKg) : '')
  }, [profile.targetWeightKg])

  const latest = history[history.length - 1]
  const previous = history[history.length - 2]
  const delta = latest && previous ? latest.kg - previous.kg : 0
  const total = latest && first ? latest.kg - first.kg : 0
  const lastGirths = [...history].reverse().find((r) => r.waist || r.chest || r.hips)

  const parsed = parseNumber(value)
  const error = parsed !== null && (parsed < 30 || parsed > 300)
    ? 'От 30 до 300 кг' : null
  const waistError = girthError(waist)
  const chestError = girthError(chest)
  const hipsError = girthError(hips)
  const valid = parsed !== null && !error && !waistError && !chestError && !hipsError

  const targetParsed = parseNumber(target)
  const targetError = targetParsed !== null && (targetParsed < 30 || targetParsed > 300)
    ? 'От 30 до 300 кг' : null

  // Прогноз — общий с «Сегодня» и отчётами (goalForecast): по реальному
  // тренду последних взвешиваний, если он есть, иначе по темпу из анкеты
  const forecast = latest && profile.targetWeightKg
    ? goalForecast(history, profile.targetWeightKg, profile) : null
  const weeks = forecast?.weeks ?? null
  const trend = forecast?.basis === 'trend' ? forecast.rate : null

  async function save() {
    if (!valid) return
    setSaving(true)
    try {
      const kg = Math.round(parsed * 10) / 10
      const rec: WeightRecord = { date: dayKey(), kg }
      const cm = (raw: string) => {
        const n = parseNumber(raw)
        return n ? Math.round(n * 10) / 10 : null
      }
      const w = cm(waist); const c = cm(chest); const h = cm(hips)
      if (w) rec.waist = w
      if (c) rec.chest = c
      if (h) rec.hips = h
      await putWeight(rec)
      // Норма считается от актуального веса — если её не задавали руками
      if (!profile.targetsManual) await resetToAutoTargets(parsed)
      tap()
      setValue(''); setWaist(''); setChest(''); setHips('')
      onSaved(profile.targetsManual
        ? 'Вес записан. Норма задана вручную, поэтому не изменилась.'
        : 'Вес записан, норма и вода пересчитаны.')
    } finally {
      setSaving(false)
    }
  }

  async function saveTarget() {
    if (targetError) return
    await updateProfile({ targetWeightKg: targetParsed ?? undefined })
    tap()
    onSaved(targetParsed ? `Цель ${targetParsed} кг сохранена.` : 'Цель убрана.')
  }

  return (
    <Glass>
      <div className={s.head}>
        <span className={s.title}>Вес</span>
        {latest && (
          <span className={s.when}>{humanDay(latest.date)}</span>
        )}
      </div>

      {latest ? (
        <div className={s.now}>
          <span className={`${s.big} num`}>
            <CountUp value={latest.kg} digits={1} /><span className={s.unit}> кг</span>
          </span>
          <span className={s.deltas}>
            {delta !== 0 && (
              <span className={`${delta < 0 ? s.down : s.up} num`}>
                {delta > 0 ? '+' : ''}{delta.toFixed(1)} кг с прошлого раза
              </span>
            )}
            {history.length > 2 && (
              <span className={`${s.flat} num`}>
                {total > 0 ? '+' : ''}{total.toFixed(1)} кг за всё время
              </span>
            )}
          </span>
        </div>
      ) : loaded && (
        <p className={s.note}>
          Запишите первое взвешивание — с него начнётся график в отчётах.
        </p>
      )}

      {latest && profile.targetWeightKg && (
        <p className={`${s.goalLine} num`}>
          До цели {Math.abs(profile.targetWeightKg - latest.kg).toFixed(1)} кг
          {weeks !== null && <> · {humanWeeks(weeks)}</>}
          {trend !== null && <span className={s.trend}> · сейчас {trend > 0 ? '+' : ''}{trend.toFixed(2)} кг/нед</span>}
        </p>
      )}

      <div className={s.form}>
        <NumberField
          label="Сегодняшний вес" unit="кг" decimal
          placeholder={latest ? latest.kg.toFixed(1) : '75.0'}
          value={value} onChange={setValue} error={error}
        />

        {girths ? (
          // Дробные: «85,5» раньше превращалось в 855 — целое поле съедало запятую
          <div ref={girthsBox} className={s.girths}>
            <NumberField label="Талия" unit="см" size="md" decimal value={waist} onChange={setWaist}
              error={waistError} placeholder={lastGirths?.waist ? String(lastGirths.waist) : ''} />
            <NumberField label="Грудь" unit="см" size="md" decimal value={chest} onChange={setChest}
              error={chestError} placeholder={lastGirths?.chest ? String(lastGirths.chest) : ''} />
            <NumberField label="Бёдра" unit="см" size="md" decimal value={hips} onChange={setHips}
              error={hipsError} placeholder={lastGirths?.hips ? String(lastGirths.hips) : ''} />
          </div>
        ) : (
          <button className={`${s.link} pressable`} onClick={() => setGirths(true)}>
            + обхваты{lastGirths ? ` · талия ${lastGirths.waist ?? '—'}, грудь ${lastGirths.chest ?? '—'}, бёдра ${lastGirths.hips ?? '—'}` : ''}
          </button>
        )}

        <Pill block disabled={!valid || saving} onClick={save}>
          {saving ? 'Сохраняем…' : 'Записать вес'}
        </Pill>
      </div>

      <div className={s.targetRow}>
        <NumberField
          label="Целевой вес" unit="кг" decimal size="md" placeholder="—"
          value={target} onChange={setTarget} error={targetError}
        />
        <Pill size="sm" variant="ghost" className={s.targetBtn}
          disabled={!!targetError || (targetParsed ?? 0) === (profile.targetWeightKg ?? 0)}
          onClick={saveTarget}>Сохранить</Pill>
      </div>

      {!profile.targetsManual && (
        <p className={s.note}>Норма калорий и воды пересчитается под новый вес.</p>
      )}
    </Glass>
  )
}
