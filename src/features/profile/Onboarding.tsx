import { useMemo, useState } from 'react'
import { Glass } from '@/ui/Glass'
import { Pill } from '@/ui/Pill'
import { Ring } from '@/ui/Ring'
import { Logo } from '@/ui/Logo'
import { NumberField, parseNumber } from '@/ui/NumberField'
import { Icon } from '@/ui/Icon'
import {
  ACTIVITY_LABELS, GOAL_LABELS, GOAL_MACROS, GOAL_RATES,
  birthDateFromAge, calcTargets,
} from '@/domain/targets'
import type { Activity, Goal, Sex } from '@/domain/types'
import { createProfile, setManualTargets } from '@/db/profile'
import { useTheme } from '@/app/theme'
import s from './Onboarding.module.css'

const STEPS = 4

const LIMITS = {
  age: { min: 14, max: 100, label: 'Возраст должен быть от 14 до 100 лет' },
  height: { min: 100, max: 250, label: 'Рост должен быть от 100 до 250 см' },
  weight: { min: 30, max: 300, label: 'Вес должен быть от 30 до 300 кг' },
}

function validate(raw: string, limit: { min: number; max: number; label: string }) {
  const n = parseNumber(raw)
  if (n === null) return { value: null, error: null }
  if (n < limit.min || n > limit.max) return { value: null, error: limit.label }
  return { value: n, error: null }
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { theme } = useTheme()
  const [step, setStep] = useState(0)

  const [sex, setSex] = useState<Sex>('male')
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [activity, setActivity] = useState<Activity>('light')
  const [goal, setGoal] = useState<Goal>('lose')
  const [ratePerWeek, setRatePerWeek] = useState(0.5)

  const [manualKcal, setManualKcal] = useState('')
  const [saving, setSaving] = useState(false)

  const ageField = validate(age, LIMITS.age)
  const heightField = validate(height, LIMITS.height)
  const weightField = validate(weight, LIMITS.weight)

  const basicsReady =
    ageField.value !== null && heightField.value !== null && weightField.value !== null

  // Смена цели меняет и разумный набор темпов: набирать по килограмму
  // в неделю невозможно без набора жира, поэтому список для набора короче
  function pickGoal(next: Goal) {
    setGoal(next)
    const rates = GOAL_RATES[next]
    if (!rates.includes(ratePerWeek)) setRatePerWeek(rates[Math.min(1, rates.length - 1)]!)
  }

  const result = useMemo(() => {
    if (!basicsReady) return null
    return calcTargets({
      sex,
      birthDate: birthDateFromAge(ageField.value!),
      heightCm: heightField.value!,
      weightKg: weightField.value!,
      activity,
      goal,
      ratePerWeek: goal === 'keep' ? 0 : ratePerWeek,
    })
  }, [basicsReady, sex, ageField.value, heightField.value, weightField.value,
      activity, goal, ratePerWeek])

  const manual = parseNumber(manualKcal)
  const kcal = manual ?? result?.targets.kcal ?? 0

  async function finish() {
    if (!result || !basicsReady) return
    setSaving(true)
    try {
      await createProfile({
        sex,
        birthDate: birthDateFromAge(ageField.value!),
        heightCm: heightField.value!,
        weightKg: weightField.value!,
        activity,
        goal,
        ratePerWeek: goal === 'keep' ? 0 : ratePerWeek,
        waterGoalMl: Math.round(weightField.value! * 30),
        theme,
      })
      if (manual !== null && manual !== result.targets.kcal) {
        // Углеводы подстраиваются под изменённую калорийность,
        // а белки и жиры остаются требованиями цели
        const rest = manual - result.targets.protein * 4 - result.targets.fat * 9
        await setManualTargets({
          kcal: manual,
          protein: result.targets.protein,
          fat: result.targets.fat,
          carbs: Math.max(0, Math.round(rest / 4)),
        })
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  // Кнопка не гаснет молча: если чего-то не хватает, об этом написано прямо
  const missing = !basicsReady
    ? [
        ageField.value === null && 'возраст',
        heightField.value === null && 'рост',
        weightField.value === null && 'вес',
      ].filter(Boolean).join(', ')
    : ''

  return (
    <div className={s.screen}>
      <div className={s.progress}>
        {Array.from({ length: STEPS }, (_, i) => (
          <div key={i} className={`${s.dot} ${i <= step ? s.dotOn : ''}`} />
        ))}
      </div>

      {step === 0 && (
        <>
          <div className={s.brand}>
            <Logo size={56} />
          </div>
          <div className={s.kicker}>Шаг 1 из 4</div>
          <h1 className={s.title}>Расскажите о себе</h1>
          <p className={s.sub}>
            По этим цифрам считается дневная норма. Они остаются на устройстве
            и никуда не отправляются.
          </p>

          <div className={s.body}>
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

            <NumberField
              label="Возраст" unit="лет" placeholder="30"
              value={age} onChange={setAge} error={ageField.error}
            />

            <div className={s.pair}>
              <NumberField
                label="Рост" unit="см" placeholder="175"
                value={height} onChange={setHeight} error={heightField.error}
              />
              <NumberField
                label="Вес" unit="кг" placeholder="75" decimal
                value={weight} onChange={setWeight} error={weightField.error}
              />
            </div>

            {missing && (
              <p className={s.note}>Заполните {missing}, чтобы продолжить.</p>
            )}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div className={s.kicker}>Шаг 2 из 4</div>
          <h1 className={s.title}>Сколько вы двигаетесь</h1>
          <p className={s.sub}>Учитывайте работу и бытовую активность, не только тренировки.</p>
          <div className={s.body}>
            <div className={s.options} role="radiogroup" aria-label="Активность">
              {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((key) => (
                <button
                  key={key} type="button" role="radio" aria-checked={activity === key}
                  className={`${s.option} ${activity === key ? s.optionOn : ''}`}
                  onClick={() => setActivity(key)}
                >
                  <span>
                    <div className={s.optionTitle}>{ACTIVITY_LABELS[key].title}</div>
                    <div className={s.optionHint}>{ACTIVITY_LABELS[key].hint}</div>
                  </span>
                  <span className={`${s.check} ${activity === key ? s.checkOn : ''}`}>
                    {activity === key && <Icon name="check" size={12} strokeWidth={3} />}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className={s.kicker}>Шаг 3 из 4</div>
          <h1 className={s.title}>Какая цель</h1>
          <p className={s.sub}>От неё зависит и норма калорий, и требования по белкам и жирам.</p>
          <div className={s.body}>
            <div className={s.options} role="radiogroup" aria-label="Цель">
              {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
                <button
                  key={g} type="button" role="radio" aria-checked={goal === g}
                  className={`${s.option} ${goal === g ? s.optionOn : ''}`}
                  onClick={() => pickGoal(g)}
                >
                  <span>
                    <div className={s.optionTitle}>{GOAL_LABELS[g].title}</div>
                    <div className={s.optionHint}>{GOAL_LABELS[g].hint}</div>
                  </span>
                  <span className={`${s.check} ${goal === g ? s.checkOn : ''}`}>
                    {goal === g && <Icon name="check" size={12} strokeWidth={3} />}
                  </span>
                </button>
              ))}
            </div>

            {goal !== 'keep' && (
              <div className={s.field}>
                <span className={s.label}>
                  Темп, кг в неделю
                </span>
                <div className={s.segment}>
                  {GOAL_RATES[goal].map((r) => (
                    <button
                      key={r} type="button"
                      className={`${s.segItem} ${ratePerWeek === r ? s.segItemOn : ''} num`}
                      onClick={() => setRatePerWeek(r)}
                    >{r}</button>
                  ))}
                </div>
                <p className={s.hint}>
                  {goal === 'lose'
                    ? 'Здоровый темп — до 1 % массы тела в неделю. Быстрее уходят мышцы, а не жир.'
                    : 'Быстрее 0,5 кг в неделю мышцы не растут — остальное отложится жиром.'}
                </p>
              </div>
            )}

            {weightField.value !== null && (
              <p className={s.hint}>
                Для этой цели: белок {Math.round(weightField.value * GOAL_MACROS[goal].protein)} г,
                жиры {Math.round(weightField.value * GOAL_MACROS[goal].fat)} г в день.
              </p>
            )}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className={s.kicker}>Шаг 4 из 4</div>
          <h1 className={s.title}>Ваша норма</h1>
          <p className={s.sub}>Рассчитана по формуле Миффлина–Сан Жеора. Любое число можно изменить.</p>

          <div className={s.body}>
            {result && (
              <>
                <Glass accent padding="lg">
                  <div className={s.result}>
                    <Ring progress={1} size={196}>
                      <Ring.Big>{kcal}</Ring.Big>
                      <Ring.Caption>ККАЛ В ДЕНЬ</Ring.Caption>
                    </Ring>

                    <div className={s.macros}>
                      <div className={s.macro}>
                        <div className={`${s.macroValue} num`}>{result.targets.protein} г</div>
                        <div className={s.macroLabel}>Белки</div>
                      </div>
                      <div className={s.macro}>
                        <div className={`${s.macroValue} num`}>{result.targets.fat} г</div>
                        <div className={s.macroLabel}>Жиры</div>
                      </div>
                      <div className={s.macro}>
                        <div className={`${s.macroValue} num`}>{result.targets.carbs} г</div>
                        <div className={s.macroLabel}>Углеводы</div>
                      </div>
                    </div>
                  </div>
                </Glass>

                {result.clampedToBmr && (
                  <p className={`${s.note} ${s.warn}`}>
                    При таком темпе норма опустилась бы ниже базового обмена
                    ({result.bmr} ккал). Мы подняли её до безопасного минимума —
                    лучше выбрать темп поменьше.
                  </p>
                )}

                <NumberField
                  label="Норма калорий вручную" unit="ккал"
                  placeholder={String(result.targets.kcal)}
                  value={manualKcal} onChange={setManualKcal}
                />

                <p className={s.note}>
                  Базовый обмен {result.bmr} ккал · расход с активностью {result.tdee} ккал
                </p>
              </>
            )}
          </div>
        </>
      )}

      <div className={s.footer}>
        {step > 0 && (
          <Pill variant="ghost" onClick={() => setStep((v) => v - 1)}>Назад</Pill>
        )}
        {step < STEPS - 1 ? (
          <Pill block disabled={step === 0 && !basicsReady} onClick={() => setStep((v) => v + 1)}>
            Дальше
          </Pill>
        ) : (
          <Pill block disabled={saving || !result} onClick={finish}>
            {saving ? 'Сохраняем…' : 'Начать вести дневник'}
          </Pill>
        )}
      </div>
    </div>
  )
}

