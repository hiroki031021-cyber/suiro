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

// ---------- v2: 五つの段(§14) ----------

/** ④のタグ。根拠/反例/仮説 */
export type EvidenceKind = 'ground' | 'counter' | 'hypothesis'

export interface NoteFields {
  content: string // ①コンテンツ
  insight: string // ②気づき
  story: string // ③自分のストーリー
  evidence: string // ④根拠・反例・仮説
  action: string // ⑤今後の行動
}

export const NOTE_KEYS: (keyof NoteFields)[] = ['content', 'insight', 'story', 'evidence', 'action']

export const EMPTY_FIELDS: NoteFields = { content: '', insight: '', story: '', evidence: '', action: '' }

/** つなぎ(§14.11): ②を中心に3つの対がつながっているかの自己判定 */
export type LinkState = 'ok' | 'gap'
export interface NoteLinks {
  s23: LinkState | null // ③は②の実例か
  s24: LinkState | null // ④の主語を自分に戻すと②になるか
  s45: LinkState | null // ④が本当なら⑤は自然か
}
export const EMPTY_LINKS: NoteLinks = { s23: null, s24: null, s45: null }
export const hasGap = (l: NoteLinks | undefined | null) => !!l && Object.values(l).some((v) => v === 'gap')
export const linksAnswered = (l: NoteLinks | undefined | null) => !!l && Object.values(l).every((v) => v !== null)

/** 1日1件。平文・端末内のみ(日曜に読み返すのが機能なので暗号化しない §14.6) */
export interface Note {
  date: string // YYYY-MM-DD(キー)
  fields: NoteFields
  evidenceKind: EvidenceKind | null
  /** この日の①の上に添えられていた前日の仮説 */
  hypothesisFrom: string | null
  /** つなぎの判定(①②だけの日・途中終了の日はundefined) */
  links?: NoteLinks
  durationSec: number
  createdAt: number
}

export interface NoteDraft {
  date: string
  step: number
  fields: NoteFields
  evidenceKind: EvidenceKind | null
  hypothesisFrom: string | null
  links?: NoteLinks
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
  unlockAll: boolean
  unlockedStages: number[]
  completedSessions: number
  lastSessionDate: string | null
  /** 前日の④が仮説だったとき、翌日の①の上に添える(消費したらnull) */
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
