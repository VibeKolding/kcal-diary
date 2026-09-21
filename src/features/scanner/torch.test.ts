import { describe, expect, it } from 'vitest'
import {
  hasTorch, sendTorch, torchConstraints, torchFailText, trackHasTorch, type TorchTrack,
} from './torch'

describe('поддержка фонарика', () => {
  it('видит свет в обеих формах ответа', () => {
    // Chrome на Android
    expect(hasTorch({ torch: true, width: { min: 1, max: 1920 } })).toBe(true)
    // Список допустимых значений, как у остальных булевых возможностей
    expect(hasTorch({ torch: [false, true] })).toBe(true)
    expect(hasTorch({ torch: [true] })).toBe(true)
  })

  it('не видит света там, где его нет', () => {
    // Фронтальная камера или компьютер: поле есть, включить нельзя
    expect(hasTorch({ torch: false })).toBe(false)
    expect(hasTorch({ torch: [false] })).toBe(false)
    expect(hasTorch({ torch: [] })).toBe(false)
    // Обычный ответ без поля — компьютер и камеры без вспышки
    expect(hasTorch({ width: { min: 1, max: 1280 }, facingMode: ['environment'] })).toBe(false)
    expect(hasTorch({})).toBe(false)
  })

  it('не верит странным значениям', () => {
    expect(hasTorch({ torch: 'true' })).toBe(false)
    expect(hasTorch({ torch: 1 })).toBe(false)
    expect(hasTorch({ torch: ['true'] })).toBe(false)
    expect(hasTorch({ torch: null })).toBe(false)
  })

  it('переживает браузер без getCapabilities', () => {
    // Старый Firefox: метода нет, вместо объекта приходит null
    expect(hasTorch(null)).toBe(false)
    expect(hasTorch(undefined)).toBe(false)
    expect(hasTorch('torch')).toBe(false)
  })
})

describe('команда фонарику', () => {
  it('кладёт свет в необязательный набор', () => {
    expect(torchConstraints(true)).toEqual({ advanced: [{ torch: true }] })
    expect(torchConstraints(false)).toEqual({ advanced: [{ torch: false }] })
  })

  it('каждый раз новый объект: общий испортили бы по ссылке, и ушла бы не та команда', () => {
    const a = torchConstraints(true)
    const b = torchConstraints(true)
    expect(a).not.toBe(b)
    expect(a.advanced).not.toBe(b.advanced)
  })

  it('не трогает другие ограничения камеры', () => {
    // Иначе включение света сбросило бы заднюю камеру или разрешение
    expect(Object.keys(torchConstraints(true))).toEqual(['advanced'])
    expect(Object.keys(torchConstraints(true).advanced?.[0] ?? {})).toEqual(['torch'])
  })
})

/** Дорожка без камеры: помнит команды и умеет отказать или умереть */
function fakeTrack(opts: { caps?: () => unknown; reject?: boolean; throws?: boolean } = {}) {
  const calls: MediaTrackConstraints[] = []
  const track: TorchTrack & { readyState: MediaStreamTrackState } = {
    readyState: 'live',
    applyConstraints(c?: MediaTrackConstraints) {
      if (opts.throws) throw new TypeError('сломано')
      calls.push(c ?? {})
      return opts.reject ? Promise.reject(new Error('отказ')) : Promise.resolve()
    },
    ...(opts.caps ? { getCapabilities: opts.caps } : {}),
  }
  return { track, calls }
}

describe('свет у живой дорожки', () => {
  it('находит фонарик в возможностях работающей камеры', () => {
    expect(trackHasTorch(fakeTrack({ caps: () => ({ torch: true }) }).track)).toBe(true)
    expect(trackHasTorch(fakeTrack({ caps: () => ({ width: { max: 1280 } }) }).track)).toBe(false)
  })

  it('не спрашивает остановленную дорожку', () => {
    let asked = false
    const { track } = fakeTrack({ caps: () => { asked = true; return { torch: true } } })
    track.readyState = 'ended'
    expect(trackHasTorch(track)).toBe(false)
    expect(asked).toBe(false)
  })

  it('без getCapabilities или с падающим методом — света нет, а не ошибка', () => {
    expect(trackHasTorch(fakeTrack().track)).toBe(false)
    expect(trackHasTorch(fakeTrack({ caps: () => { throw new Error('нет') } }).track)).toBe(false)
  })
})

describe('отправка команды', () => {
  it('живой дорожке уходит ровно команда фонарику', async () => {
    const { track, calls } = fakeTrack()
    await sendTorch(track, true)
    await sendTorch(track, false)
    expect(calls).toEqual([{ advanced: [{ torch: true }] }, { advanced: [{ torch: false }] }])
  })

  it('остановленной дорожке не уходит ничего', async () => {
    const { track, calls } = fakeTrack()
    track.readyState = 'ended'
    await expect(sendTorch(track, false)).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('отказ камеры и синхронное исключение приходят одним путём — отказом', async () => {
    await expect(sendTorch(fakeTrack({ reject: true }).track, true)).rejects.toThrow('отказ')
    // Без этого исключение вылетело бы из остановки сканера и оборвало её
    await expect(sendTorch(fakeTrack({ throws: true }).track, false)).rejects.toThrow('сломано')
  })
})

describe('сообщение при отказе', () => {
  it('называет то действие, которое не вышло', () => {
    expect(torchFailText(true)).toBe('Не удалось включить фонарик')
    expect(torchFailText(false)).toBe('Не удалось выключить фонарик')
  })
})
