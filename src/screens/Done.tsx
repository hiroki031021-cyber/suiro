import { useState } from 'preact/hooks'
import { WeekDots } from '../components/ui'
import { COPY } from '../lib/copy'
import { downloadIcs } from '../lib/ics'
import type { CoachCard } from '../data/coachCards'
import type { Settings } from '../lib/types'

interface Props {
  settings: Settings
  dots: boolean[]
  justCompleted: boolean
  newCard: CoachCard | null
  weekCount: number
  showCloseTalk: boolean
  closeTalkRecipient: string | null // 宛先で話す: 今週のエッセイの宛先
  closeTalkTwice: boolean // 二度言い: 第7段階解禁後の週1回
  surfacedPhrase: string | null // フレーズの復路
  showReminderGuide: boolean
  backupNudge: string | null
  onCloseTalk: () => void
  onDismissReminderGuide: () => void
  onBonus: () => void
  onSettings: () => void
  onCapture: () => void
}

export function Done(props: Props) {
  const [talked, setTalked] = useState(false)
  const { settings } = props
  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">今日</span>
        <div class="bar-right">
          <button class="ghost icon" onClick={props.onCapture} aria-label="言えなかったこと">
            +
          </button>
          <button class="ghost icon" onClick={props.onSettings} aria-label="設定">
            ⚙
          </button>
        </div>
      </header>

      <div class="done-phrase fade-in-slow">{settings.donePhrase}</div>
      <WeekDots dots={props.dots} />
      {props.justCompleted && props.weekCount === 5 && <div class="week5 fade-in">{COPY.week5}</div>}

      {props.newCard && (
        <div class="coach-card fade-in">
          <div class="card-kicker">型の稽古 {props.newCard.stage}</div>
          <div class="card-title">{props.newCard.title}</div>
          <p class="card-body">{props.newCard.body}</p>
        </div>
      )}

      {props.showCloseTalk && (
        <div class="close-talk">
          <p>
            {props.closeTalkTwice
              ? COPY.closeTalkTwice
              : props.closeTalkRecipient
                ? COPY.closeTalkTo(props.closeTalkRecipient)
                : COPY.closeTalk}
          </p>
          {props.surfacedPhrase && <p class="sub">{COPY.phraseLine(props.surfacedPhrase)}</p>}
          <p class="sub">{COPY.closeTalkSub}</p>
          {talked ? (
            <span class="talk-done">✓</span>
          ) : (
            <button
              class="ghost"
              onClick={() => {
                setTalked(true)
                props.onCloseTalk()
              }}
            >
              {COPY.closeTalkDone}
            </button>
          )}
        </div>
      )}

      {props.showReminderGuide && (
        <div class="guide-card">
          <p>
            毎日の合図は、OSのリマインダーが確実です。リマインダーアプリで
            「<b>{COPY.reminderFixed}</b>」を毎日{settings.notifyTime}に登録するか、
            カレンダーに取り込んでください。
          </p>
          <div class="row">
            <button class="ghost" onClick={() => downloadIcs(settings.notifyTime)}>
              カレンダー用(.ics)を保存
            </button>
            <button class="ghost" onClick={props.onDismissReminderGuide}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {props.backupNudge && (
        <div class="backup-nudge">
          <span>{props.backupNudge}</span>
          <button class="ghost" onClick={props.onSettings}>
            書き出す
          </button>
        </div>
      )}

      <button class="ghost bonus-btn" onClick={props.onBonus}>
        書き足す
      </button>
    </div>
  )
}
