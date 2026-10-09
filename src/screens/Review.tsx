import { useEffect, useRef, useState } from 'preact/hooks'
import { CapsuleCard } from '../components/CapsuleCard'
import { COPY } from '../lib/copy'
import type { CapsuleWeek, OpenedCapsule } from '../lib/store'
import type { Note } from '../lib/types'

interface Props {
  notes: Note[] // 今週分(日付順)
  capsule: CapsuleWeek | null
  onPick: (note: Note) => Promise<void> // 1つ選ぶ=その日の完了(§14.4)
  onTalked: () => void
  onOpenCapsule: (c: CapsuleWeek) => Promise<OpenedCapsule>
  onDiscardCapsule: (c: CapsuleWeek) => Promise<void>
  onDone: () => void
  onSettings: () => void
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']
const kindLabel = (k: Note['evidenceKind']) =>
  k === 'ground' ? '根拠' : k === 'counter' ? '反例' : k === 'hypothesis' ? '仮説' : '根拠'

/** 日曜の選び直し(§14.4): 書かない日。今週の②を並べ、一つ選び、60秒で話す */
export function Review({ notes, capsule, onPick, onTalked, onOpenCapsule, onDiscardCapsule, onDone, onSettings }: Props) {
  const [picked, setPicked] = useState<Note | null>(null)
  const [phase, setPhase] = useState<'idle' | 'talking' | 'talked'>('idle')
  const [seconds, setSeconds] = useState(60)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current)
    },
    []
  )

  const pick = (n: Note) => {
    if (picked) return // 選び直しは一度だけ(レール)
    setPicked(n)
    void onPick(n)
  }

  const startTalk = () => {
    setPhase('talking')
    setSeconds(60)
    timer.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          if (timer.current) clearInterval(timer.current)
          setPhase('talked')
          onTalked()
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">日曜</span>
        <div class="bar-right">
          <button class="ghost icon" onClick={onSettings} aria-label="設定">
            ⚙
          </button>
        </div>
      </header>

      <p class="hint-static">{COPY.reviewHint}</p>

      {notes.length === 0 ? (
        <p class="empty">{COPY.reviewEmpty}</p>
      ) : (
        <ul class="insight-list">
          {notes.map((n) => {
            const dow = DOW[new Date(n.date + 'T00:00:00').getDay()]
            const sel = picked?.date === n.date
            const dim = picked && !sel
            return (
              <li key={n.date} class={`${sel ? 'picked' : ''} ${dim ? 'dim' : ''}`}>
                <button class="insight-btn" onClick={() => pick(n)} disabled={!!picked}>
                  <span class="s-date">{dow}</span>
                  <span class="insight-text">{n.fields.insight}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {picked && (
        <div class="note-full fade-in">
          <div class="note-row">
            <span class="circled">①</span>
            <p>{picked.fields.content}</p>
          </div>
          <div class="note-row">
            <span class="circled">②</span>
            <p>{picked.fields.insight}</p>
          </div>
          {picked.fields.story && (
            <div class="note-row">
              <span class="circled">③</span>
              <p>{picked.fields.story}</p>
            </div>
          )}
          {picked.fields.evidence && (
            <div class="note-row">
              <span class="circled">④</span>
              <p>
                <span class="kind-tag">{kindLabel(picked.evidenceKind)}</span>
                {picked.fields.evidence}
              </p>
            </div>
          )}
          {picked.fields.action && (
            <div class="note-row">
              <span class="circled">⑤</span>
              <p>{picked.fields.action}</p>
            </div>
          )}

          <div class="close-talk">
            {phase === 'idle' && (
              <>
                <p>{COPY.reviewTalkSub}</p>
                <p class="sub">{COPY.closeTalkSub}</p>
                <button class="primary" onClick={startTalk}>
                  {COPY.reviewTalk}
                </button>
              </>
            )}
            {phase === 'talking' && <div class="countdown">{seconds}</div>}
            {phase === 'talked' && <span class="talk-done">✓</span>}
          </div>
        </div>
      )}

      {capsule && <CapsuleCard capsule={capsule} onOpen={onOpenCapsule} onDiscard={onDiscardCapsule} />}

      <button class="ghost bonus-btn" onClick={onDone}>
        {COPY.reviewDone}
      </button>
    </div>
  )
}
