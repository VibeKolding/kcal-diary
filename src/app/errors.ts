/**
 * Ошибка словами человека.
 *
 * Сюда попадает всё, что не дало приложению открыться: отказ базы при
 * запуске и ошибки отрисовки, пойманные ErrorBoundary. Раньше на экран
 * выводился e.message как есть — «MissingAPIError IndexedDB API missing.
 * Please visit https://tinyurl.com/…»: по-английски, со сторонней короткой
 * ссылкой и без слова о том, что делать. Технический текст остаётся
 * в консоли, человеку — объяснение и одно действие.
 */

export type ErrorKind = 'chunk' | 'storage' | 'quota' | 'version' | 'network' | 'other'

export interface ErrorText {
  kind: ErrorKind
  title: string
  text: string
}

/*
 * Ленивый чанк не загрузился: вкладка пережила выкладку и просит файл со
 * старым хэшем, или пропала сеть в первой сессии, пока воркер ещё не
 * перехватывает запросы. Текст у каждого браузера свой, типа ошибки нет.
 */
const CHUNK = /dynamically imported module|Importing a module script failed|Unable to preload CSS/i

/*
 * Хранилище недоступно. Имена — из Dexie (он оборачивает отказ IndexedDB
 * в свои ошибки) и из самого браузера. InvalidState и Security так
 * выглядят приватные окна старых браузеров и запрет данных сайтов.
 */
const STORAGE = new Set([
  'MissingAPIError', 'OpenFailedError', 'DatabaseClosedError', 'InvalidStateError',
  'SecurityError', 'UnknownError', 'InvalidAccessError', 'NoSuchDatabaseError',
])

const NETWORK = /Failed to fetch|NetworkError|Load failed|network connection|Internet connection/i

/** Имя ошибки и имя вложенной: Dexie кладёт исходную ошибку браузера в inner */
function names(e: unknown): string[] {
  const out: string[] = []
  let cur: unknown = e
  for (let i = 0; i < 3 && cur && typeof cur === 'object'; i++) {
    const name = (cur as { name?: unknown }).name
    if (typeof name === 'string') out.push(name)
    cur = (cur as { inner?: unknown }).inner
  }
  return out
}

function message(e: unknown): string {
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return typeof e === 'string' ? e : ''
}

export function isChunkLoadError(e: unknown): boolean {
  return names(e).includes('ChunkLoadError') || CHUNK.test(message(e))
}

export function describeError(e: unknown): ErrorText {
  const n = names(e)
  const msg = message(e)

  if (isChunkLoadError(e)) {
    return {
      kind: 'chunk',
      title: 'Не удалось загрузить экран',
      text: 'Часть приложения не догрузилась: пропала сеть или вышла новая версия, '
        + 'пока дневник был открыт. Записи на месте — перезагрузите страницу.',
    }
  }
  // Квота и версия проверяются раньше хранилища: Dexie заворачивает их
  // в OpenFailedError, а совет у них другой
  if (n.includes('QuotaExceededError')) {
    return {
      kind: 'quota',
      title: 'На устройстве не хватает места',
      text: 'Браузеру некуда записать дневник. Освободите немного памяти '
        + 'на телефоне и попробуйте снова.',
    }
  }
  if (n.includes('VersionError')) {
    return {
      kind: 'version',
      title: 'Нужна свежая версия приложения',
      text: 'Дневник на этом устройстве сохранён более новой версией приложения, '
        + 'а открылась старая. Перезагрузите страницу — подтянется свежая.',
    }
  }
  if (n.some((name) => STORAGE.has(name))) {
    return {
      kind: 'storage',
      title: 'Браузер не даёт хранить данные',
      text: 'Дневнику нужно место в браузере, а его не дают. Так бывает в приватном '
        + 'окне или когда в настройках запрещено хранить данные сайтов. Откройте '
        + 'дневник в обычном окне или разрешите сохранение для этого сайта.',
    }
  }
  if (n.includes('TypeError') && NETWORK.test(msg)) {
    return {
      kind: 'network',
      title: 'Нет связи',
      text: 'Не удалось загрузить нужные файлы. Проверьте интернет и попробуйте снова.',
    }
  }
  // Свои ошибки приложение пишет по-русски — их можно показать как есть
  if (/[а-яё]/i.test(msg)) {
    return { kind: 'other', title: 'Что-то пошло не так', text: msg }
  }
  return {
    kind: 'other',
    title: 'Что-то пошло не так',
    text: 'Экран не открылся из-за ошибки в приложении. Записи дневника никуда '
      + 'не делись: они хранятся отдельно от экрана. Перезагрузите страницу.',
  }
}
