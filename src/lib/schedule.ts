import { IMPLEMENTED_STAGES, COACH_CARDS, type CoachCard } from '../data/coachCards'
import { dbGet, dbGetAll, dbPut } from './db'
import { missedRequiredDays, todayStr, weekMonday } from './clock'
import type { DayRecord, Essay, Mode, Settings } from './types'

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
  | { kind: 'completed' } // 今日は完了済み(または週末のもう一方の日)
  | { kind: 'drain'; minimal: boolean }
  | { kind: 'dig' } // 問いガイド(火木 §3.2)
  | { kind: 'reread'; minimal: boolean }
  | { kind: 'revise'; minimal: boolean }
  | { kind: 'checkpoint' } // 定点観測(第1日曜 §3.6)

/**
 * 今日のモードを決める(§3「今日はこれ一つ」)。
 * @param reviseTargetEssay 推敲対象(未アーカイブ・断片あり。過去週も含む §3.5)
 */
export function planToday(s: Settings, reviseTargetEssay: Essay | null, days: DayRecord[]): TodayPlan {
  const today = todayStr()
  const dow = new Date().getDay() // 0=日
  if (days.some((d) => d.date === today)) return { kind: 'completed' }

  // 欠落は「必須日(月〜金)を何日飛ばしたか」で数える(週末は休んでよい §3)
  const missed = s.lastSessionDate ? missedRequiredDays(s.lastSessionDate, today) : 0
  if (s.lastSessionDate && missed >= 3) return { kind: 'restart' }
  const minimal = s.lastSessionDate !== null && missed >= 1 // 1文だけでいい日(§7.3)

  const monday = weekMonday()
  if (dow === 6 || dow === 0) {
    // 第1日曜は定点観測が優先(§3)。その週の推敲は土曜(先行起動日)が担う
    const firstSunday = dow === 0 && Number(today.slice(8)) <= 7
    const ckDoneThisMonth = days.some((d) => d.mode === 'checkpoint' && d.date.slice(0, 7) === today.slice(0, 7))
    if (firstSunday && !ckDoneThisMonth) return { kind: 'checkpoint' }
    // 週末: 最初に起動した日=推敲。もう一方の日は完了画面(書き足しのみ)(§3)
    const revisedThisWeek = days.some((d) => d.mode === 'revise' && d.date >= monday && d.date <= today)
    if (revisedThisWeek) return { kind: 'completed' }
    // minimal日でも推敲を優先する — 完了条件は「読んだ」タップで、1文より軽い
    if (stageUnlocked(s, 4) && reviseTargetEssay) return { kind: 'revise', minimal }
    return { kind: 'drain', minimal }
  }
  if (dow === 5) {
    // 金曜: 再読(解禁前は排水)。minimal日でも再読のまま — マーク画面の通過だけで完了できる
    if (stageUnlocked(s, 6)) return { kind: 'reread', minimal }
    return { kind: 'drain', minimal }
  }
  if ((dow === 2 || dow === 4) && stageUnlocked(s, 5) && !minimal) {
    // 火木: 問いガイド。1文だけでいい日(minimal)は最軽量の排水にフォールバック
    return { kind: 'dig' }
  }
  return { kind: 'drain', minimal }
}

export interface CompletionResult {
  settings: Settings
  newCard: CoachCard | null
  weekCount: number
}

/**
 * 完了記録(全モード共通 §7.1)。冪等: 同日のレコードが既にあれば
 * completedSessionsは増やさず、carryQuestionとlastSessionDateだけ更新する
 * (flushPendingの救済とC画面のfinalizeが同日に両方走り得るため)。
 */
export async function recordCompletion(
  s: Settings,
  mode: Mode,
  carryQuestion: string | null
): Promise<CompletionResult> {
  const today = todayStr()
  const existing = await dbGet<DayRecord>('days', today)
  await dbPut('days', { date: today, mode: existing?.mode ?? mode, carryQuestion } satisfies DayRecord)
  let ns: Settings = { ...s, lastSessionDate: today, carryQuestion }
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
