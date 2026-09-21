/**
 * Фонарик камеры при сканировании.
 *
 * Свет включается через ограничения видеодорожки, но это не часть
 * основного стандарта: поддержку объявляет сама дорожка в своих
 * возможностях. Где её нет — компьютер, часть телефонов, — кнопки нет вовсе:
 * мёртвая кнопка хуже отсутствующей.
 */

/** Ограничение фонарика. В lib.dom его нет: оно из Image Capture, а не из основного стандарта */
export interface TorchConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean
}

export interface TorchConstraints extends MediaTrackConstraints {
  advanced?: TorchConstraintSet[]
}

/**
 * Умеет ли камера светить — по объекту из track.getCapabilities().
 *
 * Браузеры отвечают по-разному: Chrome на Android пишет `torch: true`,
 * а по образцу остальных булевых возможностей это список допустимых
 * значений — `[false, true]`. Годится любой ответ, где включить можно.
 * `false`, `[false]` и отсутствие поля значат одно: света нет.
 */
export function hasTorch(caps: unknown): boolean {
  if (typeof caps !== 'object' || caps === null || !('torch' in caps)) return false
  const { torch } = caps
  if (torch === true) return true
  return Array.isArray(torch) && torch.includes(true)
}

/**
 * Команда фонарику — в advanced, как её принимают браузеры, умеющие свет.
 * Набор оттуда необязательный: камера, которая не может его выполнить,
 * молча пропустит его, а не откажет. Поэтому кнопка и появляется только
 * там, где свет объявлен в возможностях, — иначе нажатие ничего бы не дало.
 */
export function torchConstraints(on: boolean): TorchConstraints {
  return { advanced: [{ torch: on }] }
}

/** То, что модулю нужно от видеодорожки: так его можно проверить без камеры */
export interface TorchTrack {
  readonly readyState: MediaStreamTrackState
  applyConstraints(constraints?: MediaTrackConstraints): Promise<void>
  /** В старом Firefox метода нет вовсе */
  getCapabilities?: () => unknown
}

/**
 * Есть ли свет у работающей дорожки. Спрашивать стоит, когда видео уже
 * играет: часть Android объявляет фонарик только у камеры, которая отдаёт
 * кадры. Остановленную дорожку не спрашиваем — ей светить уже нечем.
 */
export function trackHasTorch(track: TorchTrack): boolean {
  if (track.readyState !== 'live' || typeof track.getCapabilities !== 'function') return false
  try {
    return hasTorch(track.getCapabilities())
  } catch {
    return false
  }
}

/**
 * Отправить команду фонарику. Остановленной дорожке — никогда: свет у неё
 * погас вместе с камерой, а браузер ответил бы ошибкой. Синхронное
 * исключение тоже превращается в отказ: вызывающему достаточно одного
 * пути обработки, и остановка камеры из-за него не оборвётся.
 */
export function sendTorch(track: TorchTrack, on: boolean): Promise<void> {
  if (track.readyState !== 'live') return Promise.reject(new Error('Дорожка камеры уже остановлена'))
  try {
    return track.applyConstraints(torchConstraints(on))
  } catch (e) {
    return Promise.reject(e)
  }
}

/** Что сказать, если камера не послушалась. Тон спокойный: сканирование идёт дальше */
export function torchFailText(wanted: boolean): string {
  return wanted ? 'Не удалось включить фонарик' : 'Не удалось выключить фонарик'
}
