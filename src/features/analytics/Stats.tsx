import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Glass } from '@/ui/Glass'
import { Chip, ChipRow } from '@/ui/Chip'
import type { Profile } from '@/domain/types'
import { weekdayShort, humanDay, plural } from '@/domain/dates'
import { accuracy, averageKcal, verdict } from '@/domain/streaks'
import { deviation } from '@/domain/nutrition'
import { humanWeeks, movingAverage, weeklyTrend, weeksToTarget } from '@/domain/weight'
import { buildReport, averageMacros, periodTotals, type PeriodTotals, type Report } from './data'
import { DayTooltip, type ChartDay } from './DayTooltip'
import { Delta } from '@/ui/Delta'
import { Empty } from '@/ui/Empty'
import { CountUp } from '@/ui/CountUp'
import { Skeleton } from '@/ui/Skeleton'
import s from './Stats.module.css'

/** Разброс внутри периода: ровная неделя и качели дают один и тот же итог */
function swings(t: PeriodTotals): string {
  const parts: string[] = []
  if (t.over) parts.push(`${t.over} ${plural(t.over, 'день', 'дня', 'дней')} сверх нормы`)
  if (t.under) parts.push(`${t.under} ниже`)
  if (t.onTarget) parts.push(`${t.onTarget} в коридоре`)
  return parts.join(' · ')
}

/** Словами то же, что подсказка показывает капсулой: график скрыт от скринридера */
function dayVerdictText(d: { kcal: number; target: number; logged: boolean }): string {
  if (!d.logged) return 'нет записей'
  const { kind, amount } = deviation(d.kcal, d.target)
  if (kind === 'over') return `перебор ${amount}`
  if (kind === 'under') return `недобор ${amount}`
  return 'в норме'
}

const MACRO_ROWS = [
  { key: 'protein', label: 'Белки', color: 'var(--protein)' },
  { key: 'fat', label: 'Жиры', color: 'var(--fat)' },
  { key: 'carbs', label: 'Углеводы', color: 'var(--carbs)' },
] as const

const RANGES = [
  { days: 7, label: 'Неделя' },
  { days: 30, label: 'Месяц' },
]

export function Stats({ profile }: { profile: Profile }) {
  const [days, setDays] = useState(7)
  // Живой запрос, а не разовая загрузка: кнопка «+» открывает добавление
  // еды поверх любого экрана, и отчёт обязан учесть запись сразу, а не
  // после ухода с экрана. При смене периода useLiveQuery держит прежний
  // отчёт, пока не соберётся новый, — экран не мигает пустотой.
  const report = useLiveQuery(() => buildReport(profile, days), [profile, days])

  return (
    <div className={s.screen}>
      <h1 className={s.title}>Отчёты</h1>

      <ChipRow center>
        {RANGES.map((r) => (
          <Chip key={r.days} active={days === r.days} onClick={() => setDays(r.days)}>
            {r.label}
          </Chip>
        ))}
      </ChipRow>

      {/* Пока отчёт не собран, неизвестно, пуст ли он: заглушки вместо
          «Пока нечего показывать», которое мелькало перед графиками */}
      {report ? <ReportCards profile={profile} report={report} /> : (
        <>
          <Skeleton height={104} />
          <Skeleton height={280} />
        </>
      )}
    </div>
  )
}

function ReportCards({ profile, report }: { profile: Profile; report: Report }) {
  // Период берётся из самого отчёта, а не из выбранной вкладки: пока новый
  // отчёт собирается, подписи должны соответствовать показанным цифрам
  const { days, points, habits, weights, water, streaks, missed } = report
  const loggedCount = points.filter((p) => p.logged).length
  const avg = Math.round(averageKcal(points))
  const { macros, days: macroDays, skipped: macroSkipped } = averageMacros(points)
  const totals = periodTotals(points, profile.targets)
  const hit = Math.round(accuracy(points) * 100)

  const trend = weeklyTrend(weights)
  const smoothed = movingAverage(weights)
  const lastKg = weights[weights.length - 1]?.kg
  const goalWeeks = lastKg && profile.targetWeightKg && trend !== null
    ? weeksToTarget(lastKg, profile.targetWeightKg, trend) : null

  const waterDays = water.filter((w) => w.ml > 0)
  const waterAvg = waterDays.length
    ? Math.round(waterDays.reduce((a, w) => a + w.ml, 0) / waterDays.length) : 0
  const waterHit = water.filter((w) => w.ml >= profile.waterGoalMl).length
  const waterMax = Math.max(profile.waterGoalMl, ...water.map((w) => w.ml))

  // Явный домен: линия нормы должна оставаться в кадре даже в дни,
  // когда съедено сильно меньше — иначе сравнивать не с чем
  const maxKcal = Math.max(profile.targets.kcal, ...points.map((p) => p.kcal))
  const kcalDomain: [number, number] = [0, Math.ceil((maxKcal * 1.12) / 100) * 100]

  // БЖУ и норма едут в точку графика ради подсказки: столбцу они не нужны,
  // но без них не ответить, за счёт чего набрался перебор
  const chartData: ChartDay[] = points.map((p) => ({
    date: p.date,
    label: days <= 7 ? weekdayShort(p.date) : p.date.slice(8),
    kcal: p.kcal,
    target: p.target,
    nutrients: p.nutrients,
    macrosKnown: p.macrosKnown,
    logged: p.logged,
    verdict: verdict(p),
  }))

  // Вес и вода от еды не зависят: неделя взвешиваний без записей еды —
  // обычное начало, и прятать график веса за пустым дневником нельзя,
  // другого места у него нет. Запись воды с нулём — это убранный по ошибке
  // стакан, а не день с водой: карточка из одних нулей не нужна
  const showWeight = weights.length > 1
  const showWater = waterDays.length > 0

  return (
    <>
      {loggedCount === 0 ? (
        <Glass padding="lg">
          <Empty
            glyph="stats"
            title={showWeight || showWater ? 'Еды за этот период нет' : 'Пока нечего показывать'}
            text={`Записи за последние ${days} дней появятся здесь в виде графиков и разбора привычек.`}
          />
        </Glass>
      ) : (
        <>
          <Glass accent padding="lg">
            <div className={s.stats}>
              <div className={s.stat}>
                <div className={`${s.statValue} ${s.gold} num`}><CountUp value={avg} /></div>
                <div className={s.statLabel}>Ккал в среднем</div>
              </div>
              <div className={s.stat}>
                <div className={`${s.statValue} num`}><CountUp value={hit} />%</div>
                <div className={s.statLabel}>В коридоре нормы</div>
              </div>
              <div className={s.stat}>
                <div className={`${s.statValue} num`}><CountUp value={loggedCount} /></div>
                <div className={s.statLabel}>Дней с записями</div>
              </div>
            </div>
          </Glass>

          <Glass>
            <div className={s.cardHead}>
              <span className={s.cardTitle}>Калории по дням</span>
              <span className={s.cardHint}>норма {profile.targets.kcal}</span>
            </div>
            {/* Текстовая копия графика для скринридера */}
            <ul className="sr-only">
              {chartData.map((d) => (
                <li key={d.date}>
                  {humanDay(d.date)}: {d.kcal} ккал, {dayVerdictText(d)};
                  белки {Math.round(d.nutrients.protein)} г,
                  жиры {Math.round(d.nutrients.fat)} г,
                  углеводы {Math.round(d.nutrients.carbs)} г
                </li>
              ))}
            </ul>
            {/* accessibilityLayer выключен: иначе recharts делает svg фокусируемым
                «приложением», и Tab останавливался на графике, скрытом от скринридера */}
            <div className={s.chart} aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  accessibilityLayer={false}
                >
                  <CartesianGrid vertical={false} stroke="var(--track)" />
                  <XAxis
                    dataKey="label" tickLine={false} axisLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 10, fontWeight: 700 }}
                    interval={days <= 7 ? 0 : 4}
                  />
                  <YAxis
                    domain={kcalDomain}
                    tickLine={false} axisLine={false} width={38}
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--track)' }}
                    content={<DayTooltip targets={profile.targets} />}
                  />
                  <ReferenceLine
                    y={profile.targets.kcal}
                    stroke="var(--gold-2)" strokeDasharray="4 4"
                  />
                  <Bar dataKey="kcal" radius={[6, 6, 3, 3]} maxBarSize={30} isAnimationActive={false}>
                    {chartData.map((d) => (
                      <Cell
                        key={d.date}
                        fill={d.verdict === 'over' ? 'var(--danger)' : 'var(--gold-2)'}
                        fillOpacity={d.verdict === 'under' ? 0.45 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className={s.legend}>
              <span className={s.legendItem}>
                <i className={s.swatch} style={{ background: 'var(--gold-2)' }} /> в норме
              </span>
              <span className={s.legendItem}>
                <i className={s.swatch} style={{ background: 'var(--gold-2)', opacity: 0.45 }} /> недобор
              </span>
              <span className={s.legendItem}>
                <i className={s.swatch} style={{ background: 'var(--danger)' }} /> перебор
              </span>
            </div>
          </Glass>

          <Glass>
            <div className={s.cardHead}>
              <span className={s.cardTitle}>Итог {days <= 7 ? 'недели' : 'месяца'}</span>
              <span className={s.cardHint}>
                за {totals.days} {plural(totals.days, 'день', 'дня', 'дней')} из {totals.total}
              </span>
            </div>

            {/* Главный ответ: перебор одних дней и недобор других складываются
                в один баланс — в среднем этого не видно */}
            <div className={s.balMain}>
              <span className="num">
                {totals.kcal.value}<span className={s.balOf}> / {totals.kcal.target} ккал</span>
              </span>
              <Delta value={totals.kcal.value} target={totals.kcal.target} />
            </div>
            <p className={s.note}>{swings(totals)}</p>

            {macroDays === 0 ? (
              <p className={s.note}>
                Состав посчитать не из чего: во всех днях с записями есть быстрые записи,
                где указаны только калории.
              </p>
            ) : (
              <>
                <div className={s.balRows}>
                  {MACRO_ROWS.map((m) => (
                    <div key={m.key} className={s.balRow}>
                      <i className={s.balDot} style={{ background: m.color }} />
                      <span className={s.balLabel}>{m.label}</span>
                      <span className={`${s.balValue} num`}>
                        {totals[m.key].value}<span className={s.balOf}> / {Math.round(totals[m.key].target)} г</span>
                      </span>
                      <Delta value={totals[m.key].value} target={totals[m.key].target} />
                    </div>
                  ))}
                </div>
                <p className={`${s.note} num`}>
                  В среднем за день: Б {Math.round(macros.protein)} · Ж {Math.round(macros.fat)}
                  {' '}· У {Math.round(macros.carbs)} г
                </p>
                {macroSkipped > 0 && (
                  <p className={s.note}>
                    {macroSkipped} {plural(macroSkipped, 'день', 'дня', 'дней')} не в счёт по БЖУ:
                    там есть быстрые записи без состава.
                  </p>
                )}
              </>
            )}
          </Glass>

          <Glass>
            <div className={s.cardHead}>
              <span className={s.cardTitle}>Дисциплина</span>
              <span className={s.cardHint}>подряд · рекорд</span>
            </div>
            <div className={s.stats} style={{ marginBottom: 'var(--s4)' }}>
              <div className={s.stat}>
                <div className={`${s.statValue} ${s.gold} num`}>{streaks.current}</div>
                <div className={s.statLabel}>Дней подряд</div>
              </div>
              <div className={s.stat}>
                <div className={`${s.statValue} num`}>{streaks.best}</div>
                <div className={s.statLabel}>Лучшая серия</div>
              </div>
              <div className={s.stat}>
                <div className={`${s.statValue} num`}>{missed}</div>
                <div className={s.statLabel}>Пропущено</div>
              </div>
            </div>

            <div className={s.heat}>
              {points.map((p) => {
                const v = verdict(p)
                const cls = v === 'onTarget' ? s.heatOn
                  : v === 'under' ? s.heatUnder
                  : v === 'over' ? s.heatOver : ''
                return (
                  <div
                    key={p.date}
                    className={`${s.heatCell} ${cls}`}
                    title={`${humanDay(p.date)}: ${p.logged ? `${p.kcal} ккал` : 'нет записей'}`}
                  />
                )
              })}
            </div>
          </Glass>
        </>
      )}

      {showWeight && (
        <Glass>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>Вес</span>
            <span className={`${s.cardHint} num`}>
              {trend !== null ? `${trend > 0 ? '+' : ''}${trend.toFixed(2)} кг/нед` : `${lastKg} кг`}
            </span>
          </div>
          {goalWeeks !== null && profile.targetWeightKg && (
            <p className={`${s.forecast} num`}>
              До {profile.targetWeightKg} кг при таком темпе — {humanWeeks(goalWeeks)}
            </p>
          )}
          {trend !== null && profile.targetWeightKg && goalWeeks === null && (
            <p className={s.forecast}>Вес идёт не в сторону цели — прогноза нет.</p>
          )}
          {/* Как и у калорий: график скрыт от скринридера, числа — в списке */}
          <ul className="sr-only">
            {smoothed.map((w) => (
              <li key={w.date}>
                {humanDay(w.date)}: {w.kg} кг, в среднем за неделю {w.avg} кг
              </li>
            ))}
          </ul>
          <div className={s.chart} style={{ height: 150 }} aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={smoothed} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
                accessibilityLayer={false}
              >
                <CartesianGrid vertical={false} stroke="var(--track)" />
                <XAxis
                  dataKey="date" tickLine={false} axisLine={false}
                  tickFormatter={(d: string) => d.slice(8)}
                  tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                />
                <YAxis
                  domain={['dataMin - 1', 'dataMax + 1']}
                  tickLine={false} axisLine={false} width={38}
                  tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 14, fontSize: 12, color: 'var(--text)',
                  }}
                  formatter={(v) => [`${Number(v)} кг`, '']}
                />
                <Line
                  type="monotone" dataKey="kg" isAnimationActive={false}
                  stroke="var(--gold-2)" strokeWidth={1.5} strokeOpacity={0.55}
                  dot={{ r: 2.5, fill: 'var(--gold-1)', strokeWidth: 0 }}
                />
                {/* Сглаженная линия — то, на что стоит смотреть; точки — шум дня */}
                <Line
                  type="monotone" dataKey="avg" isAnimationActive={false}
                  stroke="var(--gold-1)" strokeWidth={2.5} dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Glass>
      )}

      {showWater && (
        <Glass>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>Вода</span>
            <span className={`${s.cardHint} num`}>норма {profile.waterGoalMl} мл</span>
          </div>
          <div className={s.stats} style={{ marginBottom: 'var(--s4)' }}>
            <div className={s.stat}>
              <div className={`${s.statValue} num`}><CountUp value={waterAvg} /></div>
              <div className={s.statLabel}>мл в день</div>
            </div>
            <div className={s.stat}>
              <div className={`${s.statValue} num`}><CountUp value={waterHit} /></div>
              <div className={s.statLabel}>дней в норме</div>
            </div>
            <div className={s.stat}>
              <div className={`${s.statValue} num`}><CountUp value={waterDays.length} /></div>
              <div className={s.statLabel}>дней с водой</div>
            </div>
          </div>
          <div className={s.waterBars} aria-hidden="true">
            {points.map((p) => {
              const ml = water.find((w) => w.date === p.date)?.ml ?? 0
              return (
                <span key={p.date} className={s.waterCol}>
                  <span
                    className={`${s.waterFill} ${ml >= profile.waterGoalMl ? s.waterOk : ''}`}
                    style={{ height: `${Math.round((ml / waterMax) * 100)}%` }}
                  />
                </span>
              )
            })}
          </div>
        </Glass>
      )}

      {habits.topFoods.length > 0 && (
        <Glass>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>Привычки</span>
            <span className={s.cardHint}>за {days} дней</span>
          </div>

          <div className={s.habitList}>
            {habits.topFoods.map((f) => (
              <div key={f.title} className={s.habit}>
                <span className={s.habitName}>{f.title}</span>
                <span className={`${s.habitValue} num`}>{f.count}× · {f.kcal} ккал</span>
              </div>
            ))}
          </div>

          {habits.heaviestMeal && (
            <div className={s.insight} style={{ marginTop: 'var(--s4)' }}>
              <span className={s.insightLabel}>Самый тяжёлый приём пищи</span>
              <span className={`${s.insightValue} num`}>
                {habits.heaviestMeal.meal} · {habits.heaviestMeal.kcal} ккал за период
              </span>
            </div>
          )}

          {habits.worstWeekday && (
            <div className={s.insight}>
              <span className={s.insightLabel}>Самый калорийный день недели</span>
              <span className={`${s.insightValue} num`}>
                {habits.worstWeekday.label} · {habits.worstWeekday.kcal} ккал в среднем
              </span>
            </div>
          )}
        </Glass>
      )}
    </>
  )
}
