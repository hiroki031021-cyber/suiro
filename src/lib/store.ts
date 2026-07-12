import { dbDel, dbGet, dbGetAll, dbPut } from './db'
import { decryptText, encryptText } from './crypto'
import { lockNow, persistClock, todayStr, weekMonday } from './clock'
import { extractKeywords } from './keywords'
import { hasInsightWord, meetsCompletion, stripDigQuestions } from './metrics'
import { EMOTION_WORDS } from '../data/emotionWords'
import type {
  BonusDraft,
  CheckpointRecord,
  DayRecord,
  DiaryEntry,
  Draft,
  EmotionEntry,
  Essay,
  InboxItem,
  Phrase,
  Settings,
} from './types'
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
  const isDig = d.digStep !== undefined
  // digのtextはQ行入りprefixを含むため常に非空 — 回答部分の有無で判定する
  const substance = isDig ? stripDigQuestions(d.text).trim() : d.text.trim()
  if (substance.length > 0) {
    await commitDiary(
      d.date,
      d.text,
      d.emotionWord || null,
      {
        chars: d.text.length,
        pauses: d.pauses,
        durationSec: Math.round(d.visibleMs / 1000),
        hasInsightWord: hasInsightWord(substance),
      },
      isDig ? 'dig' : 'drain',
      d.heavyDay ?? false
    )
    if (s.carryQuestion && s.carryQuestion === d.question) {
      s = { ...s, carryQuestion: null }
      changed = true
    }
    if (d.inboxId !== undefined) await dbDel('inbox', d.inboxId).catch(() => undefined)
    // digのtextにはQ行(?入り)が混ざるため、完了判定は1問目の回答で行う(§7.1)
    const done = isDig ? meetsCompletion(d.digFirstAnswer ?? '') : meetsCompletion(d.text)
    if (done) {
      const existing = await dbGet<DayRecord>('days', d.date)
      if (!existing) {
        await dbPut('days', {
          date: d.date,
          mode: isDig ? 'dig' : 'drain',
          carryQuestion: null,
        } satisfies DayRecord)
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
  metrics: DiaryEntry['metrics'],
  mode: 'drain' | 'dig' = 'drain',
  heavyDay = false
): Promise<void> {
  const bodyEnc = await encryptText(text)
  const entry: DiaryEntry = {
    id: `${date}#${Date.now()}`,
    date,
    mode,
    bodyEnc,
    emotionWord,
    unlockAt: lockNow() + 30 * 86400000,
    metrics,
    // 字句カウントのみ(§10.0)。反芻検出用。digはQ行を除いて抽出(汚染防止 §13.1)
    keywords: extractKeywords(mode === 'dig' ? stripDigQuestions(text) : text),
    heavyDay,
  }
  await dbPut('diary', entry)
  await persistClock()
}

/**
 * 反芻検出(§10.2): 直近3日分の日記がすべて洞察語なしで、
 * 頻出語の共通が2語以上なら、翌日の停止検出の一言を差し替える
 */
export async function checkRumination(): Promise<boolean> {
  const all = await dbGetAll<DiaryEntry>('diary')
  const byDate = new Map<string, DiaryEntry>()
  // 同日複数エントリは先勝ち(最初=本編。書き足しは判定に影響させない §2.1)
  for (const e of all.sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!byDate.has(e.date)) byDate.set(e.date, e)
  }
  const recent = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3)
  if (recent.length < 3) return false
  if (recent.some((e) => e.metrics.hasInsightWord)) return false
  const sets = recent.map((e) => new Set(e.keywords ?? []))
  if (sets.some((s) => s.size === 0)) return false
  const common = [...sets[0]].filter((w) => sets[1].has(w) && sets[2].has(w))
  return common.length >= 2
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

// ---------- タイムカプセル(§3.4) ----------

export interface CapsuleWeek {
  week: string // 週の月曜
  entries: DiaryEntry[]
}

/**
 * 解禁済み・未開封のカプセルのうち最も古い週(1週分ずつ届く §3.4)。
 * 週の全エントリが解禁済みになってから届ける — エントリ単位で判定すると
 * 週が分割配達され、「流した」週の残り半分が翌週復活してしまう
 */
export async function arrivedCapsule(): Promise<CapsuleWeek | null> {
  const now = lockNow()
  const all = await dbGetAll<DiaryEntry>('diary')
  const pending = all.filter((e) => !e.capsuleState)
  const byWeek = new Map<string, DiaryEntry[]>()
  for (const e of pending) {
    const w = weekMonday(new Date(e.date + 'T00:00:00'))
    byWeek.set(w, [...(byWeek.get(w) ?? []), e])
  }
  const ready = [...byWeek.entries()]
    .filter(([, entries]) => entries.every((e) => e.unlockAt <= now))
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  if (ready.length === 0) return null
  const [week, entries] = ready[0]
  return { week, entries: entries.sort((a, b) => (a.date < b.date ? -1 : 1)) }
}

export interface OpenedCapsule {
  words: string[]
  bodies: { date: string; emotionWord: string | null; text: string }[]
}

/** 開封: 復号は1件ずつtry/catch(1件の破損で全滅させない)。頻出語は開封時に抽出 */
export async function openCapsule(c: CapsuleWeek): Promise<OpenedCapsule> {
  const bodies: OpenedCapsule['bodies'] = []
  for (const e of c.entries) {
    try {
      bodies.push({ date: e.date, emotionWord: e.emotionWord, text: await decryptText(e.bodyEnc) })
    } catch {
      bodies.push({ date: e.date, emotionWord: e.emotionWord, text: '(この日の本文は読み出せなかった)' })
    }
  }
  const words = extractKeywords(bodies.map((b) => b.text).join('\n'), 8)
  return { words, bodies }
}

export async function setCapsuleState(c: CapsuleWeek, state: 'opened' | 'discarded'): Promise<void> {
  for (const e of c.entries) await dbPut('diary', { ...e, capsuleState: state })
}

// ---------- 言えなかったことインボックス ----------

export async function addInbox(text: string): Promise<void> {
  const t = text.trim()
  if (!t) return
  await dbPut('inbox', { text: t, createdAt: Date.now() } satisfies Omit<InboxItem, 'id'>)
}

export async function oldestInbox(): Promise<InboxItem | null> {
  const all = await dbGetAll<InboxItem>('inbox')
  return all.sort((a, b) => a.createdAt - b.createdAt)[0] ?? null
}

export const deleteInbox = (id: number) => dbDel('inbox', id)

/** 7日で黙って自動破棄(在庫管理をさせない) */
export async function sweepInbox(): Promise<void> {
  const all = await dbGetAll<InboxItem>('inbox')
  const cutoff = Date.now() - 7 * 86400000
  for (const i of all) {
    if (i.createdAt < cutoff && i.id !== undefined) await dbDel('inbox', i.id)
  }
}

// ---------- 定点観測(§3.6) ----------

export const saveCheckpoint = (r: CheckpointRecord) => dbPut('checkpoints', r)
export const getCheckpoint = (month: string) => dbGet<CheckpointRecord>('checkpoints', month)
export async function listCheckpoints(): Promise<CheckpointRecord[]> {
  return (await dbGetAll<CheckpointRecord>('checkpoints')).sort((a, b) => (a.month < b.month ? -1 : 1))
}

// ---------- フレーズの復路 ----------

/** クローズ&トークに差し込む言い回しを1つ(最も長く再登場していないもの優先) */
export async function surfacePhrase(): Promise<string | null> {
  const all = await dbGetAll<Phrase>('phrases')
  if (all.length === 0) return null
  const pick = all.sort((a, b) => (a.surfacedAt ?? 0) - (b.surfacedAt ?? 0) || a.markedAt - b.markedAt)[0]
  await dbPut('phrases', { ...pick, surfacedAt: Date.now() })
  return pick.text
}
