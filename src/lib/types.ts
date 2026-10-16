/** 'drain'|'dig'|'reread'|'revise' はv1の完了レコード用(読み出し互換のため残す) */
export type Mode = 'note' | 'review' | 'checkpoint' | 'drain' | 'dig' | 'reread' | 'revise'

export interface EncBody {
  iv: Uint8Array
  ct: ArrayBuffer
}

/** v1の日記(暗号化・30日ロック)。v2では書かれないが、タイムカプセルとして届き続ける(§14.7) */
export interface DiaryEntry {
  id: string // `${date}#${timestamp}`
  date: string // YYYY-MM-DD
  mode: 'drain' | 'dig'
  bodyEnc: EncBody
  emotionWord: string | null
  unlockAt: number
  metrics: { chars: number; pauses: number; durationSec: number; hasInsightWord: boolean }
  keywords?: string[]
  capsuleState?: 'opened' | 'discarded'
  heavyDay?: boolean
}

export interface EssaySentence {
  date: string
  text: string
}

/** v1のエッセイ。v2では書かれない。設定画面で読める・書き出せるだけ */
export interface Essay {
  weekOf: string
  theme: string
  recipient: string
  sentences: EssaySentence[]
  archivedAt: number | null
  replyImagined?: string
}

export interface Phrase {
  id?: number
  text: string
  source: 'essay' | 'capsule'
  markedAt: number
  surfacedAt?: number
}

/** 定点観測(§3.6)。月1件。音声はバックアップに含めない */
export interface CheckpointRecord {
  month: string // YYYY-MM
  createdAt: number
  wordCount: number | null
  fillerCount: number | null
  silenceCount: number | null
  closeTalkPrevCount: number | null
  audio?: ArrayBuffer
  mimeType?: string
}

export interface InboxItem {
  id?: number
  text: string
  createdAt: number
}

export interface EmotionEntry {
  word: string
  isCustom: boolean
  useCount: number
}

export interface DayRecord {
  date: string
  mode: Mode
  /** v2: その日の④が「仮説」だったときの仮説文(系譜用)。v1では持ち越しの問い */
  carryQuestion: string | null
}

// ---------- v3: メモ→イシュー→空雨傘(§15) ----------

/** ゼロ秒メモ1枚: タイトル+最大6行。1分で凍結 */
export interface Memo {
  title: string
  lines: string[]
}

/** イシューの3条件(§15.3)。true=○ / false=△ / null=未判定 */
export interface IssueConditions {
  pivotal: boolean | null // 答えが出ると何かが変わる
  deep: boolean | null // 常識と違う見立て(深い仮説)
  answerable: boolean | null // 今の自分に答えを出せる
}
export const EMPTY_CONDITIONS: IssueConditions = { pivotal: null, deep: null, answerable: null }
export const conditionsAnswered = (c: IssueConditions | null | undefined) =>
  !!c && Object.values(c).every((v) => v !== null)
export const conditionsCount = (c: IssueConditions | null | undefined) =>
  c ? Object.values(c).filter((v) => v === true).length : 0

/** つなぎ(§15.5): 空→雨、雨→傘 */
export type LinkState = 'ok' | 'gap'
export interface NoteLinks {
  sr: LinkState | null // 雨は空から言えるか
  ru: LinkState | null // 傘は雨から導けるか
}
export const EMPTY_LINKS: NoteLinks = { sr: null, ru: null }
export const hasGap = (l: NoteLinks | undefined | null) => !!l && Object.values(l).some((v) => v === 'gap')
export const linksAnswered = (l: NoteLinks | undefined | null) => !!l && Object.values(l).every((v) => v !== null)

/** v2(2026-10-09〜15)の五つの段。読み出し互換のみ */
export type EvidenceKind = 'ground' | 'counter' | 'hypothesis'
export interface NoteFields {
  content: string
  insight: string
  story: string
  evidence: string
  action: string
}

/** 1日1件。平文・端末内のみ。メモは90日後まで読み返さない(§15.7) */
export interface Note {
  date: string // YYYY-MM-DD(キー)
  memos: Memo[]
  /** 「〜ではないか」の形のイシュー。段階2未満・途中終了ならnull */
  issue: string | null
  /** イシューの元になったメモの番号(0始まり)。新しく書いたならnull */
  issueFromMemo: number | null
  conditions: IssueConditions | null
  sky: string // 事実
  rain: string // 解釈(So what?)
  umbrella: string // 行動
  links?: NoteLinks
  /** この日のメモ1の上に添えられていた前日のイシュー */
  issueFrom: string | null
  durationSec: number
  createdAt: number
  /** メモの袋(§15.7): 90日後に読んだ/流した */
  bagState?: 'opened' | 'discarded'
  // ---- v2互換 ----
  fields?: NoteFields
  evidenceKind?: EvidenceKind | null
  hypothesisFrom?: string | null
}

export type Phase = 'memo' | 'issue' | 'sky' | 'rain' | 'umbrella' | 'links'
export const PHASES: Phase[] = ['memo', 'issue', 'sky', 'rain', 'umbrella', 'links']

export interface NoteDraft {
  date: string
  phase: Phase
  memos: Memo[] // 凍結済みのメモ
  /** 書きかけのメモ(1行目=題、2行目以降=本文)。memoの段のみ */
  cur: { text: string; elapsedMs: number } | null
  issue: string
  issueFromMemo: number | null
  conditions: IssueConditions
  sky: string
  rain: string
  umbrella: string
  links: NoteLinks
  issueFrom: string | null
  visibleMs: number
  stepMs: number
}

/** v1の下書き(起動時の遡及確定にのみ使う) */
export interface Draft {
  date: string
  question: string
  text: string
  emotionWord: string
  pauses: number
  visibleMs: number
  digStep?: number
  digFirstAnswer?: string
  inboxId?: number
  heavyDay?: boolean
}

export interface BonusDraft {
  date: string
  text: string
  emotionWord: string
}

export interface Settings {
  onboarded: boolean
  ifThenText: string
  notifyTime: string // "HH:MM"
  donePhrase: string
  /** 1日の持ち時間(分)。声の60秒を含む。既定15 */
  sessionMinutes: number
  /** メモの縛り(削除不可)を外し、普通の入力欄にする(端末で入力が壊れたときの逃げ道 §15.11) */
  memoLoose: boolean
  unlockAll: boolean
  unlockedStages: number[]
  completedSessions: number
  lastSessionDate: string | null
  /** 前日のイシュー。翌日のメモ1の上に「昨日のイシュー」として添える(消費したらnull) */
  carryHypothesis: string | null
  lastBackupAt: number | null
  closeTalk: { month: string; count: number }
  closeTalkPrev: { month: string; count: number }
  reminderGuideShown: boolean
  notifiedOn: string | null
  backupNudgeMonth: string
  // ---- v1互換(読み出しのみ。UIからは消えた) ----
  addresseeTemplate: string
  drainSeconds: number
  carryQuestion: string | null
  backspaceHintShown: boolean
  usedQuestionIds: number[]
  userName: string
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  ifThenText: '',
  notifyTime: '21:00',
  donePhrase: '水路、通った',
  sessionMinutes: 15,
  memoLoose: false,
  unlockAll: false,
  unlockedStages: [],
  completedSessions: 0,
  lastSessionDate: null,
  carryHypothesis: null,
  lastBackupAt: null,
  closeTalk: { month: '', count: 0 },
  closeTalkPrev: { month: '', count: 0 },
  reminderGuideShown: false,
  notifiedOn: null,
  backupNudgeMonth: '',
  addresseeTemplate: '',
  drainSeconds: 150,
  carryQuestion: null,
  backspaceHintShown: false,
  usedQuestionIds: [],
  userName: '',
}
