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

export type ErrorKind = 'chunk' | 'storage' | 'storage-glitch' | 'quota' | 'version' | 'network' | 'other'

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
 * Хранилище недоступно вовсе: базы нет, её не дали открыть или запретили.
 * Имена — из Dexie (он оборачивает отказ IndexedDB в свои ошибки) и из
 * самого браузера. Так выглядят приватные окна старых браузеров и запрет
 * данных сайтов — только тут и уместен совет про приватное окно.
 */
const STORAGE = new Set([
  'MissingAPIError', 'OpenFailedError', 'SecurityError', 'InvalidAccessError', 'NoSuchDatabaseError',
])

/*
 * Хранилище есть, но браузер не выполнил запрос: внутренний сбой
 * (UnknownError — в Safari так выглядит, например, курсор, который он не
 * умеет открыть), закрытое или закрывающееся соединение. Раньше это
 * называлось «браузер не даёт хранить данные» с советом про приватное
 * окно — у человека в обычном Safari с уже сохранённой анкетой. Записи при
 * таком сбое целы, и сказать нужно именно это.
 */
const GLITCH = new Set(['UnknownError', 'DatabaseClosedError', 'InvalidStateError'])

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

/** Первая строка стека, указывающая в наш код: «Today-abc123.js:1:2345» */
export function firstFrame(stack: string | null | undefined): string | null {
  if (!stack) return null
  const m = /\/assets\/([\w.-]+\.js):(\d+):(\d+)/.exec(stack)
  return m ? `${m[1]}:${m[2]}:${m[3]}` : null
}

/**
 * Короткий технический код ошибки для снимка экрана.
 *
 * Текст на экране ошибки нарочно человеческий, и по снимку с телефона
 * нельзя было понять, что сломалось: «Браузер не даёт хранить данные»
 * одинаково выглядит для запрета хранилища, обрыва связи с ним и
 * SecurityError совсем из другого API. Код — имя ошибки, её сообщение без
 * адресов и место в собранном файле; с картой исходников той же сборки
 * по нему находится строка в коде. Личных данных тут нет: сообщения
 * браузера их не содержат, а адреса вырезаются.
 */
export function errorCode(e: unknown, componentStack?: string | null): string {
  const n = names(e)
  const msg = message(e)
    .replace(/https?:\/\/\S+/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
  const stack = e && typeof e === 'object' ? (e as { stack?: unknown }).stack : null
  const parts = [
    n.length ? n.join(' ← ') : typeof e,
    msg,
    firstFrame(typeof stack === 'string' ? stack : null),
    componentStack ? `в ${firstFrame(componentStack) ?? '?'}` : null,
  ]
  return parts.filter(Boolean).join(' · ')
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
  // Запрет узнаётся по имени, а не по отдельному сбою: приватное окно
  // старого Firefox — это InvalidStateError при открытии базы
  const blocked = n.includes('MissingAPIError') || n.includes('SecurityError')
    || (n[0] === 'OpenFailedError' && n.includes('InvalidStateError'))
  // Всё прочее с UnknownError — сбой, а не запрет. И OpenFailedError с ним
  // внутри тоже: Safari иногда не открывает базу с «internal error» и
  // открывает после перезагрузки
  if (!blocked && n.some((name) => GLITCH.has(name))) {
    return {
      kind: 'storage-glitch',
      title: 'Браузер не смог прочитать дневник',
      text: 'Это сбой хранилища браузера, а не ваших записей: они на месте. '
        + 'Перезагрузите страницу. Если ошибка повторяется, сделайте снимок этого '
        + 'экрана — по строке внизу разработчик найдёт причину.',
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
