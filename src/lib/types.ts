export type Mode = 'drain' | 'reread' | 'revise'

export interface EncBody {
  iv: Uint8Array
  ct: ArrayBuffer
}

export interface DiaryEntry {
  id: string // `${date}#${timestamp}`
  date: string // YYYY-MM-DD
  mode: 'drain'
  bodyEnc: EncBody
  emotionWord: string | null
  unlockAt: number
  metrics: { chars: number; pauses: number; durationSec: number; hasInsightWord: boolean }
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
  reminderGuideShown: boolean
  notifiedOn: string | null
  backupNudgeMonth: string
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
  reminderGuideShown: false,
  notifiedOn: null,
  backupNudgeMonth: '',
}
