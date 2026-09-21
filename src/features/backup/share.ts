/*
 * Как отдать файл человеку: листом «Поделиться» или загрузкой.
 *
 * На телефоне «Скачать» кладёт копию в папку загрузок того же телефона —
 * то есть туда, где она пропадёт вместе с ним. Лист «Поделиться» даёт
 * одним касанием отправить её в iCloud Drive, Google Drive, Telegram или
 * себе на почту, и копия переживёт потерю устройства. На компьютере такого
 * листа ждать не приходится, там привычна обычная загрузка.
 */

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled'

export interface SaveEnv {
  /** Палец, а не мышь: телефон или планшет */
  coarsePointer: boolean
  /** Браузер умеет поделиться именно этим файлом (navigator.canShare) */
  canShareFile: boolean
}

export function saveMethod(env: SaveEnv): 'share' | 'download' {
  return env.coarsePointer && env.canShareFile ? 'share' : 'download'
}

/**
 * Чем кончился отказ navigator.share. AbortError — человек сам закрыл лист:
 * копии нет, и отмечать её сделанной нельзя. Всё остальное (нет жеста,
 * запрет, сбой системы) — повод отдать файл обычной загрузкой.
 */
export function shareFailure(error: unknown): 'cancelled' | 'fallback' {
  const name = typeof error === 'object' && error !== null
    ? (error as { name?: unknown }).name : undefined
  return name === 'AbortError' ? 'cancelled' : 'fallback'
}

function currentEnv(file: File): SaveEnv {
  const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  let canShareFile = false
  try {
    canShareFile = typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] }) === true
  } catch {
    // canShare бросает на неподдерживаемом типе в части браузеров — значит, нет
  }
  return { coarsePointer, canShareFile }
}

function download(file: File): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  // Ссылку отзываем не сразу: Safari начинает читать файл уже после click(),
  // и мгновенный отзыв срывал загрузку
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Отдать файл. 'downloaded' значит «браузер получил загрузку»: сохранил ли
 * человек файл в диалоге, веб-страница узнать не может.
 */
export async function saveFile(file: File, title: string): Promise<SaveOutcome> {
  if (saveMethod(currentEnv(file)) === 'share') {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if (shareFailure(e) === 'cancelled') return 'cancelled'
    }
  }
  download(file)
  return 'downloaded'
}
