import { useCallback, useEffect, useRef, useState } from 'react'
import { Pill } from '@/ui/Pill'
import type { Food } from '@/domain/types'
import { createFood, findByBarcode } from '@/db/foods'
import type { BarcodeFormat as ZxingFormat } from '@zxing/browser'
import { lookupProduct, type OffLookup } from './openfoodfacts'
import { PRODUCT_FORMATS, isProductBarcode, type ProductFormat } from './barcode'
import { Spinner } from '@/ui/Spinner'
import { Icon } from '@/ui/Icon'
import { sendTorch, torchFailText, trackHasTorch } from './torch'
import s from './Scanner.module.css'

/** Почему продукт не нашёлся: от этого зависит, что посоветовать */
type Miss = Exclude<OffLookup['kind'], 'found'>

type State =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'scanning' }
  | { kind: 'looking'; code: string }
  | { kind: 'miss'; code: string; reason: Miss }
  | { kind: 'error'; message: string }

interface Props {
  onFound: (food: Food) => void
  /** Код передаётся, когда он уже прочитан: форма может сохранить его с продуктом */
  onManual: (code?: string) => void
}

const MISS_TEXT: Record<Miss, string> = {
  missing: 'Такого штрихкода нет в открытой базе продуктов. Введите данные с упаковки вручную.',
  incomplete: 'Товар в базе есть, но без состава или с ошибкой в нём. Введите данные с упаковки вручную.',
  unavailable: 'База продуктов сейчас не отвечает. Попробуйте позже или введите данные с упаковки вручную.',
  timeout: 'База продуктов не ответила вовремя. Попробуйте ещё раз или введите данные с упаковки вручную.',
  offline: 'Этого штрихкода нет в базе на устройстве, а сети сейчас нет. Введите данные с упаковки вручную.',
  broken: 'Не получилось разобрать ответ базы продуктов. Попробуйте ещё раз или введите данные вручную.',
}

type BarcodeDetectorCtor = new (o: { formats: string[] }) => {
  detect: (src: CanvasImageSource) => Promise<{ rawValue: string; format?: string }[]>
}

/**
 * Часть Android объявляет фонарик не сразу, а когда камера уже отдаёт
 * кадры. Если на старте света не нашлось, смотрим ещё раз через это время —
 * и всё: дальше кнопка не появится, ничего не дёргается.
 */
const TORCH_RECHECK_MS = 800
/** Сколько держать сообщение о неудаче с фонариком в строке состояния */
const TORCH_NOTE_MS = 3000

/** Фонарик живого потока: чья дорожка, горит ли свет и ждём ли ответа камеры */
interface Torch {
  track: MediaStreamTrack
  on: boolean
  busy: boolean
  onEnded: () => void
}

/** Кнопки нет, свет выключен, свет горит */
type TorchView = 'none' | 'off' | 'on'

function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach((t) => t.stop())
}

/**
 * Сканер штрихкода.
 *
 * Основной путь — нативный BarcodeDetector. В Safari его нет,
 * поэтому подгружается @zxing/browser: библиотека весит немало,
 * и грузить её всем подряд незачем — только тем, кому она нужна.
 */
export function Scanner({ onFound, onManual }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const lookupRef = useRef<AbortController | null>(null)
  /*
   * Номер текущей попытки. Камера включается, а продукт ищется асинхронно,
   * и человек за это время может уйти со вкладки или закрыть панель.
   * Каждый новый шаг и размонтирование увеличивают номер, и всё, что
   * вернулось по старому номеру, гасится: поток камеры останавливается,
   * ответ базы выбрасывается и не открывает панель порции поверх
   * другого экрана.
   */
  const runRef = useRef(0)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const torchRef = useRef<Torch | null>(null)
  const torchProbeRef = useRef(0)
  const torchNoteRef = useRef(0)
  // Каждое включение камеры начинается с выключенного света
  const [torch, setTorch] = useState<TorchView>('none')
  const [torchNote, setTorchNote] = useState<string | null>(null)

  /*
   * Кнопку отцепляем от дорожки раньше, чем дорожку остановят. Ответ на уже
   * отправленную команду придёт к объекту, которого в torchRef больше нет,
   * и ничего не зажжёт: ни кнопку, ни новую команду остановленной камере.
   */
  const dropTorch = useCallback(() => {
    const t = torchRef.current
    torchRef.current = null
    clearTimeout(torchProbeRef.current)
    clearTimeout(torchNoteRef.current)
    setTorch('none')
    setTorchNote(null)
    if (!t) return
    t.track.removeEventListener('ended', t.onEnded)
    // Свет гаснет вместе с камерой, но выключаем его и явно, пока дорожка
    // ещё жива: фонарик, забытый гореть в кармане, — худший исход, и одной
    // остановке дорожки здесь доверять не хочется. Ответ уже никому не нужен
    if (t.on) sendTorch(t.track, false).catch(() => {})
  }, [])

  const stop = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
    dropTorch()
    if (streamRef.current) stopTracks(streamRef.current)
    streamRef.current = null
    lookupRef.current?.abort()
    lookupRef.current = null
  }, [dropTorch])

  useEffect(() => () => { runRef.current += 1; stop() }, [stop])

  /*
   * Включить или выключить свет. Кнопка откликается сразу, не дожидаясь
   * камеры; откажет камера — кнопка вернётся назад, а под кадром появится
   * короткое сообщение. Пока ответа нет, новые нажатия не копятся в очередь.
   */
  const switchTorch = useCallback((want: boolean) => {
    const send = (t: Torch, want: boolean) => {
      t.busy = true
      t.on = want
      clearTimeout(torchNoteRef.current)
      setTorchNote(null)
      setTorch(want ? 'on' : 'off')
      sendTorch(t.track, want).then(
        () => {
          // Сканер уже остановлен или перезапущен: этот свет больше не наш
          if (torchRef.current !== t) return
          t.busy = false
          // Пока камера включала свет, приложение успели свернуть
          if (t.on && document.hidden) send(t, false)
        },
        () => {
          if (torchRef.current !== t) return
          t.busy = false
          t.on = !want
          setTorch(t.on ? 'on' : 'off')
          setTorchNote(torchFailText(want))
          torchNoteRef.current = window.setTimeout(() => setTorchNote(null), TORCH_NOTE_MS)
        },
      )
    }
    const t = torchRef.current
    if (t && !t.busy && t.on !== want) send(t, want)
  }, [])

  // Свернули приложение — свет гасим: камера может ещё работать, но светить
  // в кармане незачем. Вернутся к сканеру — включат снова одним нажатием
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) switchTorch(false) }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [switchTorch])

  /*
   * Кнопка фонарика появляется, только если камера сама объявила свет.
   * Спрашиваем, когда видео уже играет, и один раз чуть позже — см.
   * TORCH_RECHECK_MS. Поток сверяем со streamRef: остановленный или
   * сменённый поток кнопку уже не получит.
   */
  const watchTorch = useCallback((stream: MediaStream) => {
    const track = stream.getVideoTracks()[0]
    if (!track) return
    const probe = (): boolean => {
      if (streamRef.current !== stream || torchRef.current) return true
      if (!trackHasTorch(track)) return false
      const t: Torch = {
        track, on: false, busy: false,
        // Камеру отняла система или другое приложение: кнопка светить уже не сможет
        onEnded: () => { if (torchRef.current === t) dropTorch() },
      }
      track.addEventListener('ended', t.onEnded)
      torchRef.current = t
      setTorch('off')
      return true
    }
    if (!probe()) torchProbeRef.current = window.setTimeout(probe, TORCH_RECHECK_MS)
  }, [dropTorch])

  const handleCode = useCallback(async (code: string) => {
    stop()
    const run = ++runRef.current
    const stale = () => run !== runRef.current
    const ctrl = new AbortController()
    lookupRef.current = ctrl
    setState({ kind: 'looking', code })

    try {
      const local = await findByBarcode(code)
      if (stale()) return
      if (local) {
        onFound(local)
        return
      }

      if (!navigator.onLine) {
        setState({ kind: 'miss', code, reason: 'offline' })
        return
      }

      const result = await lookupProduct(code, ctrl.signal)
      if (stale()) return
      if (result.kind !== 'found') {
        setState({ kind: 'miss', code, reason: result.kind })
        return
      }

      const { product } = result
      // Найденный продукт навсегда оседает в локальной базе:
      // в следующий раз он откроется и без сети
      const food = await createFood({
        name: product.name,
        ...(product.brand ? { brand: product.brand } : {}),
        barcode: code,
        per100: product.per100,
        category: product.category,
        servings: product.servingGrams
          ? [{ name: 'порция', grams: product.servingGrams }]
          : [],
        source: 'off',
      })
      if (!stale()) onFound(food)
    } catch {
      // Отмена — это уход со сканера, показывать по ней нечего
      if (!stale()) setState({ kind: 'miss', code, reason: 'broken' })
    }
  }, [onFound, stop])

  const start = useCallback(async () => {
    // Прежний поток, если он ещё жив, не должен остаться без хозяина
    stop()
    const run = ++runRef.current
    const stale = () => run !== runRef.current
    setState({ kind: 'starting' })
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      const video = videoRef.current
      // Пока браузер спрашивал разрешение, человек мог уйти со вкладки.
      // Очистка к этому времени уже отработала, и гасить поток больше некому
      if (stale() || !video) {
        stopTracks(stream)
        return
      }
      streamRef.current = stream
      video.srcObject = stream
      await video.play()
      // Дальше поток лежит в streamRef, и его погасил тот, кто сменил номер
      if (stale()) return
      setState({ kind: 'scanning' })
      watchTorch(stream)

      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector

      if (Detector) {
        // Только товарные коды: QR и Code 128 несут произвольный текст
        const detector = new Detector({ formats: [...PRODUCT_FORMATS] })
        let alive = true
        stopRef.current = () => { alive = false }
        const tick = async () => {
          if (!alive || !videoRef.current) return
          try {
            const hits = await detector.detect(videoRef.current)
            // Неверная контрольная цифра — это неточное чтение: ждём кадр получше
            const hit = hits.find((h) => isProductBarcode(h.rawValue, h.format))
            if (hit && alive) { void handleCode(hit.rawValue); return }
          } catch {
            // отдельный неудачный кадр — не повод останавливать сканирование
          }
          requestAnimationFrame(() => void tick())
        }
        void tick()
      } else {
        // Фолбэк для Safari и старых браузеров
        const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser')
        if (stale()) return
        const formats: [ZxingFormat, ProductFormat][] = [
          [BarcodeFormat.EAN_13, 'ean_13'], [BarcodeFormat.EAN_8, 'ean_8'],
          [BarcodeFormat.UPC_A, 'upc_a'], [BarcodeFormat.UPC_E, 'upc_e'],
        ]
        const reader = new BrowserMultiFormatReader()
        // Без подсказки zxing читает ещё QR, DataMatrix, Aztec и PDF417
        reader.possibleFormats = formats.map(([f]) => f)
        const controls = await reader.decodeFromVideoElement(video, (result, _error, own) => {
          if (!result) return
          const code = result.getText()
          const format = formats.find(([f]) => f === result.getBarcodeFormat())?.[1] ?? 'unknown'
          if (!isProductBarcode(code, format)) return
          // Первый кадр разбирается ещё до того, как controls вернутся наружу,
          // поэтому сканирование останавливаем через свои же controls
          own.stop()
          void handleCode(code)
        })
        if (stale()) {
          controls.stop()
          return
        }
        stopRef.current = () => controls.stop()
      }
    } catch (e) {
      if (stale()) {
        if (stream) stopTracks(stream)
        return
      }
      // Камера могла успеть включиться до сбоя. Без этого она работает
      // в фоне, а на экране написано, что она недоступна
      stop()
      if (stream) stopTracks(stream)
      const denied = e instanceof DOMException && e.name === 'NotAllowedError'
      setState({
        kind: 'error',
        message: denied
          ? 'Доступ к камере запрещён. Разрешите его в настройках браузера.'
          : 'Камера недоступна. Введите продукт вручную.',
      })
    }
  }, [handleCode, stop, watchTorch])

  return (
    <div className={s.wrap}>
      <div className={s.viewport}>
        <video ref={videoRef} className={s.video} playsInline muted />
        {state.kind === 'scanning' && <div className={s.reticle} />}
        {state.kind === 'scanning' && torch !== 'none' && (
          <button
            type="button"
            className={`${s.torch} ${torch === 'on' ? s.torchOn : ''}`}
            aria-label="Фонарик"
            aria-pressed={torch === 'on'}
            onClick={() => switchTorch(torch !== 'on')}
          >
            <Icon name="flashlight" size={20} />
          </button>
        )}
        {(state.kind === 'idle' || state.kind === 'error') && (
          <div className={s.placeholder}>
            <span>
              {state.kind === 'error'
                ? state.message
                : 'Наведите камеру на штрихкод упаковки'}
            </span>
          </div>
        )}
      </div>

      {/* Строка читается вслух: иначе отказ фонарика незрячий человек не узнает */}
      <div className={`${s.status} ${state.kind === 'error' ? s.error : ''}`} aria-live="polite">
        {state.kind === 'starting' && <><Spinner size={15} /> Включаем камеру…</>}
        {state.kind === 'scanning' && (torchNote ?? 'Ищем штрихкод в кадре…')}
        {state.kind === 'looking' && <><Spinner size={15} /> Ищем продукт…</>}
      </div>

      {state.kind === 'miss' && (
        <div className={s.miss}>
          <span className={s.code}>{state.code}</span>
          {MISS_TEXT[state.reason]}
          <div className={s.actions}>
            <Pill size="sm" variant="ghost" onClick={() => onManual(state.code)}>Ввести вручную</Pill>
            <Pill size="sm" variant="ghost" onClick={start}>Сканировать снова</Pill>
          </div>
        </div>
      )}

      {state.kind === 'idle' && <Pill block onClick={start}>Включить камеру</Pill>}
      {state.kind === 'error' && (
        <div className={s.actions}>
          <Pill variant="ghost" onClick={() => onManual()}>Ввести вручную</Pill>
          <Pill block onClick={start}>Включить камеру</Pill>
        </div>
      )}

      {/* База открыта по лицензии ODbL, и она просит называть источник */}
      <p className={s.credit}>
        Данные о продуктах —{' '}
        <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">Open Food Facts</a>,
        лицензия{' '}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL</a>
      </p>
    </div>
  )
}
