import { plural } from '@/domain/dates'

/** Итог восстановления словами: «3 записи, 1 продукт, 2 взвешивания» */
export function restoredText(res: { entries: number; foods: number; weights: number }): string {
  return [
    `${res.entries} ${plural(res.entries, 'запись', 'записи', 'записей')}`,
    `${res.foods} ${plural(res.foods, 'продукт', 'продукта', 'продуктов')}`,
    `${res.weights} ${plural(res.weights, 'взвешивание', 'взвешивания', 'взвешиваний')}`,
  ].join(', ')
}

/** Чем закончилась выгрузка файла — и что об этом сказать. На телефоне
    файл уходит через окно «Поделиться», и «сохранена в загрузки» там было
    бы неправдой. null — молчать: человек сам закрыл окно, сообщать нечего. */
export function exportedText(
  how: 'shared' | 'downloaded' | 'cancelled', what: 'Копия' | 'Таблица' = 'Копия',
): string | null {
  if (how === 'shared') return `${what} отправлена`
  if (how === 'downloaded') return `${what} сохранена в загрузки`
  return null
}
