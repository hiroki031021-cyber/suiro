import { QUESTION_BANK, type QuestionCategory } from '../data/questionBank'
import type { Settings } from './types'

/** 問いバンクから未使用優先で1問選ぶ(§8.1)。使い切ったらそのカテゴリをリセット */
export function pickQuestion(
  s: Settings,
  category: QuestionCategory = 'starter'
): { question: string; usedQuestionIds: number[] } {
  const pool = QUESTION_BANK.map((q, i) => ({ ...q, i })).filter((q) => q.category === category)
  let used = s.usedQuestionIds
  let unused = pool.filter((q) => !used.includes(q.i))
  if (unused.length === 0) {
    used = used.filter((i) => QUESTION_BANK[i]?.category !== category)
    unused = pool
  }
  const pick = unused[Math.floor(Math.random() * unused.length)]
  return { question: pick.text, usedQuestionIds: [...used, pick.i] }
}

export function themeCandidates(s: Settings, carryHistory: string[]): string[] {
  const fromCarry = carryHistory.filter(Boolean).slice(-3)
  const fromBank = QUESTION_BANK.filter((q) => q.category === 'theme')
    .map((q) => q.text)
    .filter((t) => !fromCarry.includes(t))
  const picks: string[] = []
  while (picks.length < 2 && fromBank.length > 0) {
    const i = Math.floor(Math.random() * fromBank.length)
    picks.push(fromBank.splice(i, 1)[0])
  }
  return [...fromCarry, ...picks]
}
