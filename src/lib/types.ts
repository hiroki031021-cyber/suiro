/** 1枚のメモ。書いたら読み返さない。3か月後・6か月後に一度ずつ届く */
export interface Page {
  id: string // `${date}#${createdAt}`
  date: string // YYYY-MM-DD
  title: string
  body: string // 本文(改行区切り、4〜6行目安)
  createdAt: number
  durationMs: number
  /** 見返した回数(0→3か月後に届く、1→6か月後に届く、2→もう届かない) */
  reviews: number
  /** 深掘り: 元になった紙のid(閉じた紙の1行を次の題にしたとき) */
  parentId?: string
}

export interface Draft {
  date: string
  title: string
  body: string
  elapsedMs: number
  parentId?: string
}

export interface Settings {
  introSeen: boolean
  pagesPerDay: number
  secondsPerPage: number
  bankIndex: number
}

export const DEFAULT_SETTINGS: Settings = {
  introSeen: false,
  pagesPerDay: 10,
  secondsPerPage: 60,
  bankIndex: 0,
}
