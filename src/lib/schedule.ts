import { IMPLEMENTED_STAGES, COACH_CARDS, type CoachCard } from '../data/coachCards'
import { dbGet, dbGetAll, dbPut } from './db'
import { missedRequiredDays, todayStr, weekMonday } from './clock'
import type { DayRecord, Mode, Settings } from './types'

export function stageUnlocked(s: Settings, stage: number): boolean {
  if (!IMPLEMENTED_STAGES.includes(stage)) return false
  return s.unlockAll || s.unlockedStages.includes(stage)
}

/** 完了5回ごとに、次の実装済み段階を1つだけ解禁する(§5) */
function nextUnlock(s: Settings): number | null {
  const locked = IMPLEMENTED_STAGES.filter((st) => !s.unlockedStages.includes(st))
  if (locked.length === 0) return null
  const next = locked[0]
  const idx = IMPLEMENTED_STAGES.indexOf(next)
  return s.completedSessions >= idx * 5 ? next : null
}

export type TodayPlan =
  | { kind: 'restart' }
  | { kind: 'completed' }
  | { kind: 'note'; minimal: boolean } // 五つの段(月〜土、§14.2)
  | { kind: 'review' } // 日曜の選び直し(§14.4)
  | { kind: 'checkpoint' } // 定点観測(第1日曜 §3.6)

/**
 * 今日のモードを決める(§3「今日はこれ一つ」)。
 * @param weekNoteCount 今週のノート数(0なら日曜も五つの段)
 */
export function planToday(s: Settings, days: DayRecord[], weekNoteCount: number): TodayPlan {
  const today = todayStr()
  const dow = new Date().getDay() // 0=日
  if (days.some((d) => d.date === today)) return { kind: 'completed' }

  // 欠落は「必須日(月〜土)を何日飛ばしたか」で数える(日曜は休んでよい §14.4)
  const missed = s.lastSessionDate ? missedRequiredDays(s.lastSessionDate, today) : 0
  if (s.lastSessionDate && missed >= 3) return { kind: 'restart' }
  const minimal = s.lastSessionDate !== null && missed >= 1 // ①②だけでいい日(§7.3)

  if (dow === 0) {
    // 第1日曜は定点観測が優先(§3)。その週の選び直しは休み
    const firstSunday = Number(today.slice(8)) <= 7
    const ckDoneThisMonth = days.some((d) => d.mode === 'checkpoint' && d.date.slice(0, 7) === today.slice(0, 7))
    if (firstSunday && !ckDoneThisMonth) return { kind: 'checkpoint' }
    if (stageUnlocked(s, 5) && weekNoteCount > 0) return { kind: 'review' }
  }
  return { kind: 'note', minimal }
}

export interface CompletionResult {
  settings: Settings
  newCard: CoachCard | null
  weekCount: number
}

/**
 * 完了記録(全モード共通 §7.1)。冪等: 同日のレコードが既にあれば
 * completedSessionsは増やさず、仮説の持ち越しとlastSessionDateだけ更新する。
 * @param carryHypothesis その日の④が仮説ならその文(翌日の①に添える)。それ以外はnull
 */
export async function recordCompletion(
  s: Settings,
  mode: Mode,
  carryHypothesis: string | null
): Promise<CompletionResult> {
  const today = todayStr()
  const existing = await dbGet<DayRecord>('days', today)
  await dbPut('days', { date: today, mode: existing?.mode ?? mode, carryQuestion: carryHypothesis } satisfies DayRecord)
  let ns: Settings = { ...s, lastSessionDate: today, carryHypothesis }
  let newCard: CoachCard | null = null
  if (!existing) {
    ns = { ...ns, completedSessions: ns.completedSessions + 1 }
    const unlocked = nextUnlock(ns)
    if (unlocked !== null) {
      ns = { ...ns, unlockedStages: [...ns.unlockedStages, unlocked] }
      newCard = COACH_CARDS.find((c) => c.stage === unlocked) ?? null
    }
  }
  const weekCount = await countWeekCompletions()
  return { settings: ns, newCard, weekCount }
}

export async function countWeekCompletions(): Promise<number> {
  const monday = weekMonday()
  const days = await dbGetAll<DayRecord>('days')
  return days.filter((d) => d.date >= monday).length
}

export async function weekDots(): Promise<boolean[]> {
  const monday = weekMonday()
  const days = await dbGetAll<DayRecord>('days')
  const set = new Set(days.map((d) => d.date))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday + 'T00:00:00')
    d.setDate(d.getDate() + i)
    return set.has(todayStr(d))
  })
}
