export type Mode = 'drain' | 'dig' | 'reread' | 'revise' | 'checkpoint'

export interface EncBody {
  iv: Uint8Array
  ct: ArrayBuffer
}

export interface DiaryEntry {
  id: string // `${date}#${timestamp}`
  date: string // YYYY-MM-DD
  mode: 'drain' | 'dig'
  bodyEnc: EncBody
  emotionWord: string | null
  unlockAt: number
  metrics: { chars: number; pauses: number; durationSec: number; hasInsightWord: boolean }
  /** 頻出語(平文・字句カウントのみ §10.0)。反芻検出に使う */
  keywords?: string[]
  /** タイムカプセルの状態。undefined=未解禁または未開封 */
  capsuleState?: 'opened' | 'discarded'
  heavyDay?: boolean
}

export interface EssaySentence {
  date: string
  text: string
}

export interface Essay {
  weekOf: string // 週の月曜 YYYY-MM-DD
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
  /** フレーズの復路: 最後にクローズ&トークへ差し込まれた時刻(最古優先ローテーション) */
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

/** 言えなかったことインボックス(最小形: 「次はこう言う」の一言のみ。7日で自動破棄) */
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
  carryQuestion: string | null
}

export interface Draft {
  date: string
  question: string
  text: string
  emotionWord: string
  pauses: number
  visibleMs: number
  /** 問いガイド(dig)進行中: 現在のステップ(0-4) */
  digStep?: number
  /** 問いガイド: 1問目の回答(完了判定 §7.1 はこれで行う — textにはQ行が混ざるため) */
  digFirstAnswer?: string
  /** インボックス由来の問いを使った場合のid(完了時に消費) */
  inboxId?: number
  heavyDay?: boolean
}

/** 書き足し(判定に影響しない同日2本目)の下書き。settleStaleDraftの遡及完了対象外 */
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
  addresseeTemplate: string
  drainSeconds: number
  unlockAll: boolean
  unlockedStages: number[]
  completedSessions: number
  lastSessionDate: string | null
  carryQuestion: string | null
  backspaceHintShown: boolean
  lastBackupAt: number | null
  usedQuestionIds: number[]
  closeTalk: { month: string; count: number }
  /** 月替わりで消える前月分の声出し回数(定点観測でのみ表示 §3.6) */
  closeTalkPrev: { month: string; count: number }
  reminderGuideShown: boolean
  notifiedOn: string | null
  backupNudgeMonth: string
  /** 重い日モードの主語用(任意。未設定なら汎用文言) */
  userName: string
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  ifThenText: '',
  notifyTime: '21:00',
  donePhrase: '水路、通った',
  addresseeTemplate: '10年後のおれへ ─ ',
  drainSeconds: 150,
  unlockAll: false,
  unlockedStages: [],
  completedSessions: 0,
  lastSessionDate: null,
  carryQuestion: null,
  backspaceHintShown: false,
  lastBackupAt: null,
  usedQuestionIds: [],
  closeTalk: { month: '', count: 0 },
  closeTalkPrev: { month: '', count: 0 },
  reminderGuideShown: false,
  notifiedOn: null,
  backupNudgeMonth: '',
  userName: '',
}
