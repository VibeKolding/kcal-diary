/**
 * Текст для тоста, когда запись в базу не удалась.
 *
 * Раньше сбой проходил молча: кнопка «не работала», панель не закрывалась,
 * а наружу уходил только необработанный отказ в консоль. Человек думал,
 * что еда записана, хотя её не было. Самая частая причина на телефоне —
 * кончилось место, и о ней говорим прямо: остальное человек исправить
 * не может, а место освободить может.
 */
export function saveErrorText(error: unknown): string {
  return isQuotaError(error)
    ? 'Не удалось сохранить: на устройстве не хватает места.'
    : 'Не удалось сохранить. Попробуйте ещё раз.'
}

/** Dexie заворачивает ошибку IndexedDB в свою, исходная лежит в inner */
function isQuotaError(error: unknown): boolean {
  for (let e = error, depth = 0; e && typeof e === 'object' && depth < 3; depth++) {
    const { name, inner } = e as { name?: unknown; inner?: unknown }
    if (typeof name === 'string' && /quota/i.test(name)) return true
    e = inner
  }
  return false
}
