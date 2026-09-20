import { useEffect, useState } from 'react'
import { Sheet } from '@/ui/Sheet'
import { Glass } from '@/ui/Glass'
import { Pill } from '@/ui/Pill'
import { FoodIcon } from '@/ui/FoodIcon'
import { MEAL_LABELS, scale } from '@/domain/nutrition'
import type { Entry } from '@/domain/types'
import { deleteEntry, restoreEntry, updateEntryGrams } from '@/db/entries'
import { useLast } from '@/ui/useLast'
import { tap } from '@/ui/haptic'
import { useToast } from '@/ui/Toast'
import s from './EntrySheet.module.css'

/** Правка веса уже добавленной записи и её удаление */
export function EntrySheet({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const [grams, setGrams] = useState(100)
  const toast = useToast()

  useEffect(() => {
    if (entry) setGrams(Math.round(entry.grams))
  }, [entry])

  // Панель уезжает с последней записью, даже когда родитель её уже обнулил
  const shown = useLast(entry)
  if (!shown) return null

  const n = scale(shown.per100, grams)

  async function save() {
    if (!shown) return
    await updateEntryGrams(shown.id, grams)
    tap()
    onClose()
  }

  async function remove() {
    if (!shown) return
    const snapshot = shown
    await deleteEntry(snapshot.id)
    tap()
    onClose()
    // Удаление без подтверждения, зато с откатом: запись возвращается
    // с тем же id, и день выглядит так, будто ничего не трогали
    toast({
      text: `Удалено: ${snapshot.title}`,
      action: { label: 'Отменить', onClick: () => restoreEntry(snapshot) },
    })
  }

  return (
    <Sheet open={entry !== null} title="Изменить запись" onClose={onClose}>
      <div className={s.wrap}>
        <div className={s.head}>
          <FoodIcon category={shown.category} size={44} />
          <div>
            <div className={s.name}>{shown.title}</div>
            <div className={s.meta}>
              {MEAL_LABELS[shown.meal]} · {shown.per100.kcal} ккал на 100 г
            </div>
          </div>
        </div>

        <div>
          <div className={s.gramsRow}>
            <input
              className={s.gramsInput}
              type="number" inputMode="numeric" min={1} max={3000}
              value={grams}
              onChange={(e) => setGrams(Math.max(1, Number(e.target.value) || 0))}
            />
            <span className={s.unit}>граммов</span>
          </div>
          <input
            className={s.slider}
            type="range" min={5} max={600} step={5}
            value={Math.min(grams, 600)}
            onChange={(e) => setGrams(Number(e.target.value))}
            style={{ marginTop: 'var(--s4)' }}
            aria-label="Вес порции"
          />
        </div>

        <Glass flat>
          <div className={s.grid}>
            <div className={`${s.cell} ${s.kcalCell}`}>
              <div className={`${s.cellValue} num`}>{Math.round(n.kcal)}</div>
              <div className={s.cellLabel}>ккал</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.cellValue} num`}>{n.protein.toFixed(1)}</div>
              <div className={s.cellLabel}>белки</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.cellValue} num`}>{n.fat.toFixed(1)}</div>
              <div className={s.cellLabel}>жиры</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.cellValue} num`}>{n.carbs.toFixed(1)}</div>
              <div className={s.cellLabel}>углеводы</div>
            </div>
          </div>
        </Glass>

        <div className={s.actions}>
          <Pill variant="ghost" className={s.danger} onClick={remove}>Удалить</Pill>
          <Pill block onClick={save}>Сохранить</Pill>
        </div>
      </div>
    </Sheet>
  )
}
