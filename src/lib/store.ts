import { dbDel, dbGet, dbGetAll, dbPut } from './db'
import { decryptText, encryptText } from './crypto'
import { lockNow, persistClock, todayStr, weekMonday } from './clock'
import { extractKeywords } from './keywords'
import { hasInsightWord, meetsCompletion, stripDigQuestions } from './metrics'
import type {
  BonusDraft,
  CheckpointRecord,
  DayRecord,
  DiaryEntry,
  Draft,
  EvidenceKind,
  Note,
  NoteDraft,
  NoteFields,
  Settings,
} from './types'
import { DEFAULT_SETTINGS, EMPTY_FIELDS } from './types'

// ---------- settings ----------

export async function loadSettings(): Promise<Settings> {
  const stored = await dbGet<Partial<Settings>>('kv', 'settings')
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function saveSettings(s: Settings): Promise<void> {
  await dbPut('kv', s, 'settings')
}

// ---------- v2: ノート(五つの段 §14) ----------

export const loadNoteDraft = () => dbGet<NoteDraft>('kv', 'noteDraft')
export const saveNoteDraft = (d: NoteDraft) => dbPut('kv', d, 'noteDraft')
export const clearNoteDraft = () => dbDel('kv', 'noteDraft')

export const getNote = (date: string) => dbGet<Note>('notes', date)
export const listNotes = async () =>
  (await dbGetAll<Note>('notes')).sort((a, b) => (a.date < b.date ? -1 : 1))

export async function commitNote(
  date: string,
  fields: NoteFields,
  evidenceKind: EvidenceKind | null,
  hypothesisFrom: string | null,
  durationSec: number
): Promise<void> {
  const existing = await getNote(date)
  const trimmed: NoteFields = { ...EMPTY_FIELDS }
  for (const k of Object.keys(fields) as (keyof NoteFields)[]) trimmed[k] = fields[k].trim()
  await dbPut('notes', {
    date,
    fields: trimmed,
    evidenceKind: trimmed.evidence ? evidenceKind : null,
    hypothesisFrom,
    durationSec,
    createdAt: existing?.createdAt ?? Date.now(),
  } satisfies Note)
  await persistClock()
}

/** 完了条件(§14.3): ①が空でなく、②に句点1つ or 20字以上 */
export function noteComplete(f: NoteFields): boolean {
  return f.content.trim().length > 0 && meetsCompletion(f.insight)
}

/** 今週(月曜〜今日)のノート。日曜の選び直し(§14.4)に使う */
export async function notesThisWeek(): Promise<Note[]> {
  const monday = weekMonday()
  return (await listNotes()).filter((n) => n.date >= monday && n.date <= todayStr())
}

/** 月ごとの仮説率(§14.5): ④にタグが付いたノートのうち「仮説」の割合 */
export async function hypothesisStats(): Promise<Record<string, { h: number; n: number }>> {
  const out: Record<string, { h: number; n: number }> = {}
  for (const n of await listNotes()) {
    if (!n.evidenceKind) continue
    const m = n.date.slice(0, 7)
    out[m] = out[m] ?? { h: 0, n: 0 }
    out[m].n++
    if (n.evidenceKind === 'hypothesis') out[m].h++
  }
  return out
}

/**
 * 日付をまたいだ書きかけは自動保存(§2.1と同じ思想)。
 * 完了条件を満たしていればその日を完了扱いに遡及し、仮説の持ち越しも行う。
 */
export async function settleStaleNoteDraft(s: Settings): Promise<Settings> {
  const d = await loadNoteDraft()
  if (!d || d.date === todayStr()) return s
  const hasText = Object.values(d.fields).some((v) => v.trim().length > 0)
  if (hasText) {
    await commitNote(d.date, d.fields, d.evidenceKind, d.hypothesisFrom, Math.round(d.visibleMs / 1000))
    if (noteComplete(d.fields)) {
      const existing = await dbGet<DayRecord>('days', d.date)
      if (!existing) {
        const hyp = d.evidenceKind === 'hypothesis' && d.fields.evidence.trim() ? d.fields.evidence.trim() : null
        await dbPut('days', { date: d.date, mode: 'note', carryQuestion: hyp } satisfies DayRecord)
        s = {
          ...s,
          completedSessions: s.completedSessions + 1,
          lastSessionDate: s.lastSessionDate && s.lastSessionDate > d.date ? s.lastSessionDate : d.date,
          carryHypothesis: hyp,
        }
        await saveSettings(s)
      }
    }
  }
  await clearNoteDraft()
  return s
}

/** Markdown書き出し(設定画面)。再生産可能な形で手元に残す */
export function notesToMarkdown(notes: Note[]): string {
  const kind = (k: EvidenceKind | null) =>
    k === 'ground' ? '根拠' : k === 'counter' ? '反例' : k === 'hypothesis' ? '仮説' : '根拠'
  return notes
    .map((n) =>
      [
        `# ${n.date}`,
        n.hypothesisFrom ? `> 昨日の仮説 ─ ${n.hypothesisFrom}\n` : '',
        `## ① コンテンツ\n${n.fields.content}`,
        `## ② 気づき\n${n.fields.insight}`,
        `## ③ 自分のストーリー\n${n.fields.story}`,
        `## ④ ${kind(n.evidenceKind)}\n${n.fields.evidence}`,
        `## ⑤ 今後の行動\n${n.fields.action}`,
      ]
        .filter((x) => x !== '')
        .join('\n\n')
    )
    .join('\n\n---\n\n')
}

// ---------- v1の下書きの遡及確定(互換) ----------

export const loadDraft = () => dbGet<Draft>('kv', 'draft')
export const clearDraft = () => dbDel('kv', 'draft')
export const loadBonusDraft = () => dbGet<BonusDraft>('kv', 'bonusDraft')
export const clearBonusDraft = () => dbDel('kv', 'bonusDraft')

/** v1.1から更新した直後に残っている排水/問いガイドの書きかけを、日記として確定する */
export async function settleLegacyDrafts(): Promise<void> {
  const d = await loadDraft()
  if (d && d.date !== todayStr()) {
    const isDig = d.digStep !== undefined
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
        isDig ? 'dig' : 'drain'
      )
    }
  }
  if (d) await clearDraft()
  const b = await loadBonusDraft()
  if (b) {
    if (b.text.trim().length > 0) {
      await commitDiary(b.date, b.text, b.emotionWord || null, {
        chars: b.text.length,
        pauses: 0,
        durationSec: 0,
        hasInsightWord: hasInsightWord(b.text),
      })
    }
    await clearBonusDraft()
  }
}

async function commitDiary(
  date: string,
  text: string,
  emotionWord: string | null,
  metrics: DiaryEntry['metrics'],
  mode: 'drain' | 'dig' = 'drain'
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
    keywords: extractKeywords(mode === 'dig' ? stripDigQuestions(text) : text),
  }
  await dbPut('diary', entry)
  await persistClock()
}

// ---------- misc ----------

export function downloadText(name: string, text: string, type = 'text/plain'): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

// ---------- タイムカプセル(§3.4: v1の日記が届く間だけ) ----------

export interface CapsuleWeek {
  week: string // 週の月曜
  entries: DiaryEntry[]
}

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

// ---------- 定点観測(§3.6) ----------

export const saveCheckpoint = (r: CheckpointRecord) => dbPut('checkpoints', r)
export const getCheckpoint = (month: string) => dbGet<CheckpointRecord>('checkpoints', month)
export async function listCheckpoints(): Promise<CheckpointRecord[]> {
  return (await dbGetAll<CheckpointRecord>('checkpoints')).sort((a, b) => (a.month < b.month ? -1 : 1))
}
