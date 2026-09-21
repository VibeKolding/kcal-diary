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
import { GramsInput } from './GramsInput'
import { gramsDraft, parseGrams } from './grams'
import { saveErrorText } from './saveError'
import { useSave } from './useSave'
import s from './EntrySheet.module.css'

/** Правка веса уже добавленной записи и её удаление */
export function EntrySheet({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const [draft, setDraft] = useState('100')
  const toast = useToast()
  const { pending, run } = useSave()

  useEffect(() => {
    if (entry) setDraft(gramsDraft(entry.grams))
  }, [entry])

  // Панель уезжает с последней записью, даже когда родитель её уже обнулил
  const shown = useLast(entry)
  if (!shown) return null

  const grams = parseGrams(draft)
  const n = scale(shown.per100, grams ?? 0)

  function save() {
    if (!shown || grams === null) return
    void run(async () => {
      await updateEntryGrams(shown.id, grams)
      tap()
      onClose()
    })
  }

  function remove() {
    if (!shown) return
    const snapshot = shown
    void run(async () => {
      await deleteEntry(snapshot.id)
      tap()
      onClose()
      // Удаление без подтверждения, зато с откатом: запись возвращается
      // с тем же id, и день выглядит так, будто ничего не трогали
      toast({
        text: `Удалено: ${snapshot.title}`,
        action: {
          label: 'Отменить',
          onClick: () => restoreEntry(snapshot).catch((e: unknown) => toast({ text: saveErrorText(e) })),
        },
      })
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

        <GramsInput value={draft} onChange={setDraft} />

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
          <Pill variant="ghost" className={s.danger} disabled={pending} onClick={remove}>Удалить</Pill>
          <Pill block disabled={pending || grams === null} onClick={save}>Сохранить</Pill>
        </div>
      </div>
    </Sheet>
  )
}
