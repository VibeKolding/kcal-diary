import { useCallback, useEffect, useRef, useState } from 'react'
import { Pill } from '@/ui/Pill'
import type { Food } from '@/domain/types'
import { createFood, findByBarcode } from '@/db/foods'
import { fetchProduct } from './openfoodfacts'
import { Spinner } from '@/ui/Spinner'
import s from './Scanner.module.css'

type State =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'scanning' }
  | { kind: 'looking'; code: string }
  | { kind: 'offline'; code: string }
  | { kind: 'missing'; code: string }
  | { kind: 'error'; message: string }

interface Props {
  onFound: (food: Food) => void
  onManual: () => void
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
  const [state, setState] = useState<State>({ kind: 'idle' })

  const stop = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  const handleCode = useCallback(async (code: string) => {
    stop()
    setState({ kind: 'looking', code })

    const local = await findByBarcode(code)
    if (local) {
      onFound(local)
      return
    }

    if (!navigator.onLine) {
      setState({ kind: 'offline', code })
      return
    }

    try {
      const product = await fetchProduct(code)
      if (!product) {
        setState({ kind: 'missing', code })
        return
      }
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
      onFound(food)
    } catch {
      setState({ kind: 'offline', code })
    }
  }, [onFound, stop])

  const start = useCallback(async () => {
    setState({ kind: 'starting' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      setState({ kind: 'scanning' })

      const Detector = (window as unknown as {
        BarcodeDetector?: new (o: { formats: string[] }) => {
          detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>
        }
      }).BarcodeDetector

      if (Detector) {
        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
        })
        let alive = true
        stopRef.current = () => { alive = false }
        const tick = async () => {
          if (!alive || !videoRef.current) return
          try {
            const hits = await detector.detect(videoRef.current)
            const value = hits[0]?.rawValue
            if (value) { void handleCode(value); return }
          } catch {
            // отдельный неудачный кадр — не повод останавливать сканирование
          }
          requestAnimationFrame(() => void tick())
        }
        void tick()
      } else {
        // Фолбэк для Safari и старых браузеров
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) void handleCode(result.getText())
        })
        stopRef.current = () => controls.stop()
      }
    } catch (e) {
      const denied = e instanceof DOMException && e.name === 'NotAllowedError'
      setState({
        kind: 'error',
        message: denied
          ? 'Доступ к камере запрещён. Разрешите его в настройках браузера.'
          : 'Камера недоступна. Введите продукт вручную.',
      })
    }
  }, [handleCode])

  return (
    <div className={s.wrap}>
      <div className={s.viewport}>
        <video ref={videoRef} className={s.video} playsInline muted />
        {state.kind === 'scanning' && <div className={s.reticle} />}
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

      <div className={`${s.status} ${state.kind === 'error' ? s.error : ''}`}>
        {state.kind === 'starting' && <><Spinner size={15} /> Включаем камеру…</>}
        {state.kind === 'scanning' && 'Ищем штрихкод в кадре…'}
        {state.kind === 'looking' && <><Spinner size={15} /> Ищем продукт…</>}
      </div>

      {(state.kind === 'offline' || state.kind === 'missing') && (
        <div className={s.offline}>
          <span className={s.code}>{state.code}</span>
          {state.kind === 'offline'
            ? 'Этого штрихкода нет в базе на устройстве, а сети сейчас нет. Заведите продукт вручную — он сохранится вместе с кодом.'
            : 'Такого штрихкода нет в открытой базе продуктов. Введите данные с упаковки вручную — в следующий раз он найдётся сразу.'}
          <Pill size="sm" variant="ghost" onClick={onManual}>Ввести вручную</Pill>
        </div>
      )}

      {(state.kind === 'idle' || state.kind === 'error') && (
        <Pill block onClick={start}>Включить камеру</Pill>
      )}
    </div>
  )
}
