import type { ExportOutcome } from '@/features/backup/backup'

/** Флаг в meta: человек прочитал карточку «Где хранится дневник» и нажал «Понятно» */
export const STORAGE_NOTICE_SEEN = 'storageNoticeSeen'

/**
 * Тост после сохранения копии. На телефоне копия уходит через окно
 * «Поделиться» — в iCloud Drive, Google Drive, Telegram, — и «сохранена
 * в загрузки» там было бы неправдой. Отказ из этого окна — не ошибка,
 * человек передумал, и говорить тут нечего.
 */
export function backupDoneText(outcome: ExportOutcome): string | null {
  if (outcome === 'shared') return 'Копия отправлена'
  if (outcome === 'downloaded') return 'Копия сохранена в загрузки'
  return null
}

/**
 * Текст карточки. Совет про экран «Домой» не нужен тому, у кого приложение
 * уже там: он читал бы про шаг, который давно сделал.
 */
export function storageNoticeText(installed: boolean): string[] {
  return [
    'Дневник хранится только на этом телефоне — аккаунта и сервера нет. '
      + 'Если очистить данные браузера или удалить приложение, записи сотрутся.',
    installed
      ? 'Раз в неделю сохраняйте копию: её можно отправить в iCloud Drive, Google Drive или Telegram.'
      : 'Добавьте приложение на экран «Домой»: без этого Safari на iPhone может стереть данные, '
        + 'если сайт не открывали неделю. И раз в неделю сохраняйте копию — её можно отправить '
        + 'в iCloud Drive, Google Drive или Telegram.',
  ]
}

/** Строка напоминания: первая копия и давняя копия — разные поводы */
export function nudgeText(lastBackupAt: number | null): string {
  return lastBackupAt === null
    ? 'Дневник хранится только на этом телефоне. Копии пока нет.'
    : 'Дневник хранится только на этом телефоне. Копии нет больше недели.'
}
