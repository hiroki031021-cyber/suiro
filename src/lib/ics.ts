import { COPY } from './copy'

const p2 = (n: number) => String(n).padStart(2, '0')

/**
 * 毎日繰り返し+アラーム付きの.icsを生成してダウンロードさせる(§11.3)。
 * 購読方式は使わない — 購読カレンダーのアラームはiOS/macOSで既定削除されるため、
 * 取り込み(インポート)方式にする。
 */
export function downloadIcs(time: string): void {
  const [h, m] = time.split(':').map(Number)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 21, m || 0)
  if (start.getTime() < now.getTime()) start.setDate(start.getDate() + 1)
  const fmt = (d: Date) =>
    `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//suiro//JP',
    'BEGIN:VEVENT',
    'UID:suiro-daily@local',
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    'DURATION:PT15M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${COPY.reminderFixed}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${COPY.reminderFixed}`,
    'TRIGGER:PT0S',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'suiro.ics'
  a.click()
  URL.revokeObjectURL(a.href)
}
