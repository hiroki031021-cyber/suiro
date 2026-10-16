import { dbDel, dbGet, dbGetAll, dbPut } from './db'
import { decryptText, encryptText } from './crypto'
import { lockNow, persistClock, todayStr, weekMonday } from './clock'
import { extractKeywords } from './keywords'
import { hasInsightWord, stripDigQuestions } from './metrics'
import type {
  BonusDraft,
  CheckpointRecord,
  DayRecord,
  DiaryEntry,
  Draft,
  Memo,
  Note,
  NoteDraft,
  Settings,
} from './types'
import { DEFAULT_SETTINGS, conditionsAnswered, conditionsCount, hasGap, linksAnswered } from './types'

// ---------- settings ----------

export async function loadSettings(): Promise<Settings> {
  const stored = await dbGet<Partial<Settings>>('kv', 'settings')
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function saveSettings(s: Settings): Promise<void> {
  await dbPut('kv', s, 'settings')
}

// ---------- v3: ノート(メモ→イシュー→空雨傘 §15) ----------

export const loadNoteDraft = () => dbGet<NoteDraft>('kv', 'noteDraft')
export const saveNoteDraft = (d: NoteDraft) => dbPut('kv', d, 'noteDraft')
export const clearNoteDraft = () => dbDel('kv', 'noteDraft')

export const getNote = (date: string) => dbGet<Note>('notes', date)
export const listNotes = async () =>
  (await dbGetAll<Note>('notes')).sort((a, b) => (a.date < b.date ? -1 : 1))

export const memoHasBody = (m: Memo) => m.title.trim().length > 0 && m.lines.some((l) => l.trim().length > 0)

/** 完了条件(§15.6): 題と本文1行のあるメモが1枚以上 */
export const draftComplete = (memos: Memo[]) => memos.some(memoHasBody)

export interface NoteInput {
  memos: Memo[]
  issue: string
  issueFromMemo: number | null
  conditions: Note['conditions']
  sky: string
  rain: string
  umbrella: string
  links: Note['links']
  issueFrom: string | null
  durationSec: number
}

export async function commitNote(date: string, n: NoteInput): Promise<void> {
  const existing = await getNote(date)
  const memos = n.memos
    .map((m) => ({ title: m.title.trim(), lines: m.lines.map((l) => l.trim()).filter(Boolean) }))
    .filter(memoHasBody)
  const issue = n.issue.trim() || null
  await dbPut('notes', {
    date,
    memos,
    issue,
    issueFromMemo: issue ? n.issueFromMemo : null,
    conditions: issue && conditionsAnswered(n.conditions) ? n.conditions : null,
    sky: n.sky.trim(),
    rain: n.rain.trim(),
    umbrella: n.umbrella.trim(),
    links: linksAnswered(n.links) ? n.links : undefined,
    issueFrom: n.issueFrom,
    durationSec: n.durationSec,
    createdAt: existing?.createdAt ?? Date.now(),
    bagState: existing?.bagState,
  } satisfies Note)
  await persistClock()
}

/** 今週(月曜〜今日)のノート。日曜の棚卸し(§15.7)に使う */
export async function notesThisWeek(): Promise<Note[]> {
  const monday = weekMonday()
  return (await listNotes()).filter((n) => n.date >= monday && n.date <= todayStr())
}

/** 表示用: v3はイシュー、v2(五つの段)は②を見出しにする */
export const noteHeadline = (n: Note): string => n.issue ?? n.fields?.insight ?? n.memos?.[0]?.title ?? ''

/** 月ごとのイシュー度(§15.6): 3条件そろい本数 / 判定したイシュー本数 */
export async function issueStats(): Promise<Record<string, { f: number; n: number }>> {
  const out: Record<string, { f: number; n: number }> = {}
  for (const n of await listNotes()) {
    if (!n.issue || !n.conditions) continue
    const m = n.date.slice(0, 7)
    out[m] = out[m] ?? { f: 0, n: 0 }
    out[m].n++
    if (conditionsCount(n.conditions) === 3) out[m].f++
  }
  return out
}

/** 月ごとのずれ日数(§15.5): つなぎに答えた日のうち、一つでも「ずれ」があった日 */
export async function gapStats(): Promise<Record<string, { g: number; n: number }>> {
  const out: Record<string, { g: number; n: number }> = {}
  for (const n of await listNotes()) {
    if (!n.links) continue
    const m = n.date.slice(0, 7)
    out[m] = out[m] ?? { g: 0, n: 0 }
    out[m].n++
    if (hasGap(n.links)) out[m].g++
  }
  return out
}

/**
 * 日付をまたいだ書きかけは自動保存。完了条件を満たしていればその日を完了扱いに遡及し、
 * イシューがあれば翌日の「昨日のイシュー」にする。
 */
export async function settleStaleNoteDraft(s: Settings): Promise<Settings> {
  const d = await loadNoteDraft()
  if (!d || d.date === todayStr()) return s
  // v2の下書き(fieldsあり)はこの形を満たさないので捨てる
  if (!Array.isArray(d.memos)) {
    await clearNoteDraft()
    return s
  }
  const memos = d.cur ? [...d.memos, { title: d.cur.title, lines: [...d.cur.lines, d.cur.line] }] : d.memos
  if (draftComplete(memos)) {
    await commitNote(d.date, {
      memos,
      issue: d.issue,
      issueFromMemo: d.issueFromMemo,
      conditions: d.conditions,
      sky: d.sky,
      rain: d.rain,
      umbrella: d.umbrella,
      links: d.links,
      issueFrom: d.issueFrom,
      durationSec: Math.round(d.visibleMs / 1000),
    })
    const existing = await dbGet<DayRecord>('days', d.date)
    if (!existing) {
      const issue = d.issue.trim() || null
      await dbPut('days', { date: d.date, mode: 'note', carryQuestion: issue } satisfies DayRecord)
      s = {
        ...s,
        completedSessions: s.completedSessions + 1,
        lastSessionDate: s.lastSessionDate && s.lastSessionDate > d.date ? s.lastSessionDate : d.date,
        carryHypothesis: issue,
      }
      await saveSettings(s)
    }
  }
  await clearNoteDraft()
  return s
}

// ---------- メモの袋(§15.7): 90日後に1週分ずつ届く ----------

export interface MemoBagWeek {
  week: string
  notes: Note[]
}

export async function arrivedMemoBag(): Promise<MemoBagWeek | null> {
  const cutoff = todayStr(new Date(lockNow() - 90 * 86400000))
  const all = (await listNotes()).filter((n) => !n.bagState && (n.memos?.length ?? 0) > 0 && n.date <= cutoff)
  if (all.length === 0) return null
  const week = weekMonday(new Date(all[0].date + 'T00:00:00'))
  const notes = all.filter((n) => weekMonday(new Date(n.date + 'T00:00:00')) === week)
  return { week, notes }
}

export async function setBagState(b: MemoBagWeek, state: 'opened' | 'discarded'): Promise<void> {
  for (const n of b.notes) await dbPut('notes', { ...n, bagState: state })
}

/** Markdown書き出し(設定画面)。再生産可能な形で手元に残す */
export function notesToMarkdown(notes: Note[]): string {
  const mark = (v: boolean | null | undefined) => (v === true ? '○' : v === false ? '△' : '—')
  return notes
    .map((n) => {
      if (n.fields) {
        // v2(五つの段)
        const f = n.fields
        return [
          `# ${n.date}`,
          `## ① コンテンツ\n${f.content}`,
          `## ② 気づき\n${f.insight}`,
          `## ③ 自分のストーリー\n${f.story}`,
          `## ④ 根拠\n${f.evidence}`,
          `## ⑤ 今後の行動\n${f.action}`,
        ].join('\n\n')
      }
      const memos = (n.memos ?? [])
        .map((m, i) => `### メモ${i + 1}: ${m.title}\n${m.lines.map((l) => `- ${l}`).join('\n')}`)
        .join('\n\n')
      const parts = [`# ${n.date}`, n.issueFrom ? `> 昨日のイシュー ─ ${n.issueFrom}` : '', memos]
      if (n.issue) {
        parts.push(
          `## イシュー\n${n.issue}` +
            (n.conditions
              ? `\n\n変わる ${mark(n.conditions.pivotal)} / 常識と違う ${mark(n.conditions.deep)} / 答えを出せる ${mark(n.conditions.answerable)}`
              : '')
        )
      }
      if (n.sky || n.rain || n.umbrella) {
        parts.push(`## 空(事実)\n${n.sky}`, `## 雨(解釈)\n${n.rain}`, `## 傘(行動)\n${n.umbrella}`)
      }
      if (n.links) {
        parts.push(`つなぎ: 空→雨 ${n.links.sr === 'gap' ? 'ずれ' : '○'} / 雨→傘 ${n.links.ru === 'gap' ? 'ずれ' : '○'}`)
      }
      return parts.filter(Boolean).join('\n\n')
    })
    .join('\n\n---\n\n')
}

// ---------- v1の下書きの遡及確定(互換) ----------

export const loadDraft = () => dbGet<Draft>('kv', 'draft')
export const clearDraft = () => dbDel('kv', 'draft')
export const loadBonusDraft = () => dbGet<BonusDraft>('kv', 'bonusDraft')
export const clearBonusDraft = () => dbDel('kv', 'bonusDraft')

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
