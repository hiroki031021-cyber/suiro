import { dbDel, dbGet, dbGetAll, dbPut } from './db'
import { encryptText } from './crypto'
import { lockNow, persistClock, todayStr, weekMonday } from './clock'
import { hasInsightWord, meetsCompletion } from './metrics'
import { EMOTION_WORDS } from '../data/emotionWords'
import type { BonusDraft, DayRecord, DiaryEntry, Draft, EmotionEntry, Essay, Phrase, Settings } from './types'
import { DEFAULT_SETTINGS } from './types'

// ---------- settings ----------

export async function loadSettings(): Promise<Settings> {
  const stored = await dbGet<Partial<Settings>>('kv', 'settings')
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function saveSettings(s: Settings): Promise<void> {
  await dbPut('kv', s, 'settings')
}

// ---------- draft ----------

export const loadDraft = () => dbGet<Draft>('kv', 'draft')
export const saveDraft = (d: Draft) => dbPut('kv', d, 'draft')
export const clearDraft = () => dbDel('kv', 'draft')

export const loadBonusDraft = () => dbGet<BonusDraft>('kv', 'bonusDraft')
export const saveBonusDraft = (d: BonusDraft) => dbPut('kv', d, 'bonusDraft')
export const clearBonusDraft = () => dbDel('kv', 'bonusDraft')

/**
 * 日付をまたいだ書きかけは自動保存・ロック(§2.1)。
 * 完了条件を満たしていればその日を完了扱いに遡及する。
 * 併せて、消費済みの持ち越しの問いをリセットする(同じ問いが毎日出続けるのを防ぐ)。
 */
export async function settleStaleDraft(s: Settings): Promise<Settings> {
  const d = await loadDraft()
  if (!d || d.date === todayStr()) return s
  let changed = false
  if (d.text.trim().length > 0) {
    await commitDiary(d.date, d.text, d.emotionWord || null, {
      chars: d.text.length,
      pauses: d.pauses,
      durationSec: Math.round(d.visibleMs / 1000),
      hasInsightWord: hasInsightWord(d.text),
    })
    if (s.carryQuestion && s.carryQuestion === d.question) {
      s = { ...s, carryQuestion: null }
      changed = true
    }
    if (meetsCompletion(d.text)) {
      const existing = await dbGet<DayRecord>('days', d.date)
      if (!existing) {
        await dbPut('days', { date: d.date, mode: 'drain', carryQuestion: null } satisfies DayRecord)
        s = {
          ...s,
          completedSessions: s.completedSessions + 1,
          lastSessionDate: s.lastSessionDate && s.lastSessionDate > d.date ? s.lastSessionDate : d.date,
        }
        changed = true
      }
    }
  }
  if (changed) await saveSettings(s)
  await clearDraft()
  return s
}

/** 日付をまたいだ書き足しの下書きも日記として確定する(完了扱いにはしない §2.1) */
export async function settleBonusDraft(): Promise<void> {
  const d = await loadBonusDraft()
  if (!d) return
  if (d.text.trim().length > 0) {
    await commitDiary(d.date, d.text, d.emotionWord || null, {
      chars: d.text.length,
      pauses: 0,
      durationSec: 0,
      hasInsightWord: hasInsightWord(d.text),
    })
  }
  await clearBonusDraft()
}

// ---------- diary ----------

export async function commitDiary(
  date: string,
  text: string,
  emotionWord: string | null,
  metrics: DiaryEntry['metrics']
): Promise<void> {
  const bodyEnc = await encryptText(text)
  const entry: DiaryEntry = {
    id: `${date}#${Date.now()}`,
    date,
    mode: 'drain',
    bodyEnc,
    emotionWord,
    unlockAt: lockNow() + 30 * 86400000,
    metrics,
  }
  await dbPut('diary', entry)
  await persistClock()
}

// ---------- essays ----------

export const getEssay = (weekOf: string) => dbGet<Essay>('essays', weekOf)
export const putEssay = (e: Essay) => dbPut('essays', e)

export async function getCurrentEssay(): Promise<Essay | null> {
  return (await getEssay(weekMonday())) ?? null
}

/** 「先週の続き」用: 現在週より前で最新の未アーカイブのエッセイ(仕舞ったテーマは復活させない §3.5) */
export async function latestPastEssay(): Promise<Essay | null> {
  const monday = weekMonday()
  const all = await dbGetAll<Essay>('essays')
  const past = all
    .filter((e) => e.weekOf < monday && e.archivedAt === null)
    .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1))
  return past[0] ?? null
}

/** 推敲対象: 未アーカイブ・断片ありのエッセイ(過去週の持ち越しも含む §3.5)の最新 */
export async function reviseTarget(): Promise<Essay | null> {
  const all = await dbGetAll<Essay>('essays')
  const candidates = all
    .filter((e) => e.archivedAt === null && e.sentences.length > 0)
    .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1))
  return candidates[0] ?? null
}

export async function addEssaySentence(theme: string, recipient: string, text: string): Promise<void> {
  const weekOf = weekMonday()
  const existing = await getEssay(weekOf)
  const essay: Essay = existing ?? { weekOf, theme, recipient, sentences: [], archivedAt: null }
  if (text.trim()) essay.sentences.push({ date: todayStr(), text: text.trim() })
  await putEssay(essay)
}

// ---------- emotions / phrases ----------

export async function recordEmotion(word: string): Promise<void> {
  const w = word.trim()
  if (!w) return
  const existing = await dbGet<EmotionEntry>('emotions', w)
  await dbPut('emotions', {
    word: w,
    isCustom: existing?.isCustom ?? !EMOTION_WORDS.includes(w),
    useCount: (existing?.useCount ?? 0) + 1,
  } satisfies EmotionEntry)
}

export async function addPhrase(text: string, source: Phrase['source']): Promise<void> {
  await dbPut('phrases', { text, source, markedAt: Date.now() } satisfies Omit<Phrase, 'id'>)
}

// ---------- misc ----------

export async function carryHistoryThisWeek(): Promise<string[]> {
  const monday = weekMonday()
  const days = await dbGetAll<DayRecord>('days')
  return days
    .filter((d) => d.date >= monday && d.carryQuestion)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => d.carryQuestion as string)
}

/** テーマ候補用: 全期間から直近の持ち越しの問い(週初のテーマ設定時は今週分が空のため §2.5) */
export async function recentCarryQuestions(limit = 3): Promise<string[]> {
  const days = await dbGetAll<DayRecord>('days')
  return days
    .filter((d) => d.carryQuestion)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit)
    .map((d) => d.carryQuestion as string)
}

export function downloadText(name: string, text: string, type = 'text/plain'): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
