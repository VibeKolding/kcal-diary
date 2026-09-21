import { describe, expect, it } from 'vitest'
import { STORAGE_NOTICE_SEEN, backupDoneText, nudgeText, storageNoticeText } from './safetyText'

describe('карточки о сохранности дневника', () => {
  it('ключ флага не меняется: по нему карточка не показывается повторно', () => {
    expect(STORAGE_NOTICE_SEEN).toBe('storageNoticeSeen')
  })

  it('тост называет, куда ушла копия, а на отказ молчит', () => {
    expect(backupDoneText('shared')).toBe('Копия отправлена')
    expect(backupDoneText('downloaded')).toBe('Копия сохранена в загрузки')
    expect(backupDoneText('cancelled')).toBeNull()
  })

  it('совет про экран «Домой» — только тем, у кого приложения там нет', () => {
    expect(storageNoticeText(false).join(' ')).toMatch(/экран «Домой»/)
    expect(storageNoticeText(true).join(' ')).not.toMatch(/экран «Домой»/)
    for (const installed of [true, false]) {
      const text = storageNoticeText(installed).join(' ')
      expect(text).toMatch(/только на этом телефоне/)
      expect(text).toMatch(/iCloud Drive, Google Drive или Telegram/)
    }
  })

  it('напоминание различает «копии не было» и «копия давняя»', () => {
    expect(nudgeText(null)).toMatch(/Копии пока нет/)
    expect(nudgeText(Date.now() - 8 * 86_400_000)).toMatch(/больше недели/)
  })
})
