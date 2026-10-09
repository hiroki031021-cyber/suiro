import { useState } from 'preact/hooks'
import { COPY } from '../lib/copy'
import type { CapsuleWeek, OpenedCapsule } from '../lib/store'

interface Props {
  capsule: CapsuleWeek
  onOpen: (c: CapsuleWeek) => Promise<OpenedCapsule>
  onDiscard: (c: CapsuleWeek) => Promise<void>
}

/** v1の日記が30日後に届く(§3.4)。v2では日曜の画面の末尾にだけ出る。押した時だけ開く */
export function CapsuleCard({ capsule, onOpen, onDiscard }: Props) {
  const [phase, setPhase] = useState<'closed' | 'words' | 'body' | 'gone'>('closed')
  const [opened, setOpened] = useState<OpenedCapsule | null>(null)
  if (phase === 'gone') return null
  return (
    <>
      <div class="section-label">タイムカプセル</div>
      {phase === 'closed' && (
        <div class="capsule-card">
          <p>
            {COPY.capsuleArrived}
            <span class="s-date">({capsule.week}の週)</span>
          </p>
          <div class="row">
            <button
              class="primary"
              onClick={() => {
                void onOpen(capsule).then((o) => {
                  setOpened(o)
                  setPhase('words')
                })
              }}
            >
              {COPY.capsuleOpen}
            </button>
            <button class="ghost" onClick={() => void onDiscard(capsule).then(() => setPhase('gone'))}>
              {COPY.capsuleDiscard}
            </button>
          </div>
        </div>
      )}
      {phase === 'words' && opened && (
        <div class="capsule-card">
          <p class="hint-static">{COPY.capsuleWordsTitle}</p>
          <div class="chips">
            {opened.words.length > 0 ? (
              opened.words.map((w) => (
                <span key={w} class="chip">
                  {w}
                </span>
              ))
            ) : (
              <span class="empty">(抽出できる語がなかった)</span>
            )}
          </div>
          <button class="ghost" onClick={() => setPhase('body')}>
            {COPY.capsuleReadBody}
          </button>
        </div>
      )}
      {phase === 'body' && opened && (
        <div class="capsule-card">
          {opened.bodies.map((b) => (
            <div key={b.date} class="capsule-entry">
              <div class="s-date">
                {b.date}
                {b.emotionWord ? ` ─ ${b.emotionWord}` : ''}
              </div>
              <p class="capsule-text">{b.text}</p>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
