import { dbGet, dbPut } from './db'

// 30日ロックの判定を端末時計の巻き戻しで破れないようにするため、
// アプリが観測した最新時刻を単調増加で保持する(§9.2)
let mono = 0

export async function initClock(): Promise<void> {
  const stored = (await dbGet<number>('kv', 'monotonicClock')) ?? 0
  mono = Math.max(Date.now(), stored)
  await dbPut('kv', mono, 'monotonicClock')
}

export function lockNow(): number {
  return Math.max(Date.now(), mono)
}

/** 長期滞在セッション中の観測時刻も永続化する(§9.2 単調増加の維持) */
export async function persistClock(): Promise<void> {
  mono = Math.max(mono, Date.now())
  await dbPut('kv', mono, 'monotonicClock')
}

const p2 = (n: number) => String(n).padStart(2, '0')

export function todayStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/** その週の月曜(YYYY-MM-DD) */
export function weekMonday(d: Date = new Date()): string {
  const x = new Date(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return todayStr(x)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return todayStr(d)
}

export function monthStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`
}

/**
 * lastとtodayの間(両端排他)にある月〜金の日数 = 欠落した必須日数。
 * 週末は「両日とも起動しなくてもよい」(§3)ため欠落に数えない —
 * 暦日で数えると金曜完了→月曜起動が毎週「1文だけの日」になってしまう。
 */
export function missedRequiredDays(last: string, today: string): number {
  let n = 0
  let guard = 0
  for (let d = addDays(last, 1); d < today && guard < 400; d = addDays(d, 1), guard++) {
    const dow = new Date(d + 'T00:00:00').getDay()
    if (dow >= 1 && dow <= 5) n++
  }
  return n
}
