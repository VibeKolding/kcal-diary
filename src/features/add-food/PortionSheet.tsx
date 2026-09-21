import { useEffect, useState } from 'react'
import { Sheet } from '@/ui/Sheet'
import { Glass } from '@/ui/Glass'
import { Pill } from '@/ui/Pill'
import { Chip, ChipRow } from '@/ui/Chip'
import { FoodIcon } from '@/ui/FoodIcon'
import { scale } from '@/domain/nutrition'
import type { Food } from '@/domain/types'
import { useLast } from '@/ui/useLast'
import { StarButton } from '@/ui/StarButton'
import { Icon } from '@/ui/Icon'
import { tap } from '@/ui/haptic'
import { GramsInput } from '@/features/today/GramsInput'
import { gramsDraft, parseGrams } from '@/features/today/grams'
import { useSave } from '@/features/today/useSave'
import s from '@/features/today/EntrySheet.module.css'

interface Props {
  food: Food | null
  onClose: () => void
  /** Запись в дневник. Если бросит, панель останется открытой, а тост скажет почему */
  onConfirm: (food: Food, grams: number) => void | Promise<void>
}

/** Выбор порции: чипы готовых мер плюс слайдер граммов */
export function PortionSheet({ food, onClose, onConfirm }: Props) {
  const [draft, setDraft] = useState('100')
  const { pending, run } = useSave()

  useEffect(() => {
    if (food) setDraft(gramsDraft(food.servings[0]?.grams ?? 100))
  }, [food])

  const shown = useLast(food)
  if (!shown) return null

  const grams = parseGrams(draft)
  const n = scale(shown.per100, grams ?? 0)

  function confirm() {
    if (!shown || grams === null) return
    void run(async () => {
      await onConfirm(shown, grams)
      tap()
    })
  }

  return (
    <Sheet
      open={food !== null} title="Сколько съели" onClose={onClose}
      actions={shown.source !== 'user' || shown.id.startsWith('f') ? (
        <span className={s.sheetActions}>
          <StarButton kind="food" id={shown.id} />
          <button className={`${s.closeBtn} pressable`} onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={16} />
          </button>
        </span>
      ) : undefined}
    >
      <div className={s.wrap}>
        <div className={s.head}>
          <FoodIcon category={shown.category} size={44} />
          <div>
            <div className={s.name}>{shown.name}</div>
            <div className={s.meta}>
              {shown.brand ? `${shown.brand} · ` : ''}{shown.per100.kcal} ккал на 100 г
            </div>
          </div>
        </div>

        <ChipRow>
          {shown.servings.map((sv) => (
            <Chip key={sv.name} active={grams === sv.grams} onClick={() => setDraft(gramsDraft(sv.grams))}>
              {sv.name}
            </Chip>
          ))}
        </ChipRow>

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

        <Pill block disabled={pending || grams === null} onClick={confirm}>
          Добавить в дневник
        </Pill>
      </div>
    </Sheet>
  )
}
