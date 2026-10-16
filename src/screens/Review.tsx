import { useEffect, useRef, useState } from 'preact/hooks'
import { CapsuleCard } from '../components/CapsuleCard'
import { COPY } from '../lib/copy'
import { noteHeadline, type CapsuleWeek, type MemoBagWeek, type OpenedCapsule } from '../lib/store'
import { conditionsCount, hasGap, type Note } from '../lib/types'

interface Props {
  notes: Note[] // 今週分(日付順)
  capsule: CapsuleWeek | null
  bag: MemoBagWeek | null
  onPick: (note: Note) => Promise<void> // 1つ選ぶ=その日の完了(§15.7)
  onTalked: () => void
  onOpenCapsule: (c: CapsuleWeek) => Promise<OpenedCapsule>
  onDiscardCapsule: (c: CapsuleWeek) => Promise<void>
  onBagState: (b: MemoBagWeek, s: 'opened' | 'discarded') => Promise<void>
  onDone: () => void
  onSettings: () => void
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']
const TALK_SEC = 20

/** 日曜の棚卸し(§15.7): 書かない日。今週のイシューを並べ、一つ選び、20秒で話す */
export function Review({ notes, capsule, bag, onPick, onTalked, onOpenCapsule, onDiscardCapsule, onBagState, onDone, onSettings }: Props) {
  const [picked, setPicked] = useState<Note | null>(null)
  const [phase, setPhase] = useState<'idle' | 'talking' | 'talked'>('idle')
  const [seconds, setSeconds] = useState(TALK_SEC)
  const [bagPhase, setBagPhase] = useState<'closed' | 'open' | 'gone'>('closed')
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
    setSeconds(TALK_SEC)
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

  const marks = (n: Note) => (n.conditions ? '○'.repeat(conditionsCount(n.conditions)) + '△'.repeat(3 - conditionsCount(n.conditions)) : '')

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
                  <span class="insight-text">{noteHeadline(n)}</span>
                  {n.conditions && <span class="cond-marks">{marks(n)}</span>}
                  {hasGap(n.links) && <span class="kind-tag gap">{COPY.linkGap}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {picked && (
        <div class="note-full fade-in">
          {picked.fields ? (
            <>
              <div class="note-row"><span class="anchor-k">①</span><p>{picked.fields.content}</p></div>
              <div class="note-row"><span class="anchor-k">②</span><p>{picked.fields.insight}</p></div>
              <div class="note-row"><span class="anchor-k">③</span><p>{picked.fields.story}</p></div>
              <div class="note-row"><span class="anchor-k">④</span><p>{picked.fields.evidence}</p></div>
              <div class="note-row"><span class="anchor-k">⑤</span><p>{picked.fields.action}</p></div>
            </>
          ) : (
            <>
              {picked.issue && (
                <div class="note-row">
                  <span class="anchor-k">{COPY.issueLabel}</span>
                  <p>{picked.issue}</p>
                </div>
              )}
              {picked.sky && (
                <div class="note-row">
                  <span class="anchor-k">{COPY.skyLabel}</span>
                  <p>{picked.sky}</p>
                </div>
              )}
              {picked.rain && (
                <div class="note-row">
                  <span class="anchor-k">{COPY.rainLabel}</span>
                  <p>
                    {picked.links?.sr === 'gap' && <span class="kind-tag gap">{COPY.linkGap}</span>}
                    {picked.rain}
                  </p>
                </div>
              )}
              {picked.umbrella && (
                <div class="note-row">
                  <span class="anchor-k">{COPY.umbrellaLabel}</span>
                  <p>
                    {picked.links?.ru === 'gap' && <span class="kind-tag gap">{COPY.linkGap}</span>}
                    {picked.umbrella}
                  </p>
                </div>
              )}
              {!picked.issue && picked.memos?.[0] && (
                <ul class="memo-preview">
                  {picked.memos[0].lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
            </>
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

      {bag && bagPhase !== 'gone' && (
        <>
          <div class="section-label">メモの袋</div>
          {bagPhase === 'closed' && (
            <div class="capsule-card">
              <p>
                {COPY.bagArrived}
                <span class="s-date">({bag.week}の週)</span>
              </p>
              <div class="row">
                <button class="primary" onClick={() => void onBagState(bag, 'opened').then(() => setBagPhase('open'))}>
                  {COPY.bagOpen}
                </button>
                <button class="ghost" onClick={() => void onBagState(bag, 'discarded').then(() => setBagPhase('gone'))}>
                  {COPY.bagDiscard}
                </button>
              </div>
            </div>
          )}
          {bagPhase === 'open' && (
            <div class="capsule-card">
              {bag.notes.map((n) => (
                <div key={n.date} class="capsule-entry">
                  <div class="s-date">{n.date}</div>
                  {n.memos.map((m, i) => (
                    <div key={i} class="bag-memo">
                      <div class="bag-title">{m.title}</div>
                      <ul class="memo-preview">
                        {m.lines.map((l, j) => (
                          <li key={j}>{l}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {capsule && <CapsuleCard capsule={capsule} onOpen={onOpenCapsule} onDiscard={onDiscardCapsule} />}

      <button class="ghost bonus-btn" onClick={onDone}>
        {COPY.reviewDone}
      </button>
    </div>
  )
}
