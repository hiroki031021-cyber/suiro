import { useRef, useState } from 'preact/hooks'
import { COPY } from '../lib/copy'
import { addPhrase } from '../lib/store'
import type { CapsuleWeek, OpenedCapsule } from '../lib/store'
import type { Essay } from '../lib/types'

interface Props {
  essay: Essay | null
  carryHistory: string[]
  capsule: CapsuleWeek | null
  onOpenCapsule: (c: CapsuleWeek) => Promise<OpenedCapsule>
  onDiscardCapsule: (c: CapsuleWeek) => Promise<void>
  onDone: () => void
  onSettings: () => void
  onCapture: () => void
}

/** 金曜: 書かない日(§3.3)。マークは長押し・2つまで(レール)。カプセルは押した時だけ開く(§3.4) */
export function Reread({ essay, carryHistory, capsule, onOpenCapsule, onDiscardCapsule, onDone, onSettings, onCapture }: Props) {
  const [marked, setMarked] = useState<Set<number>>(new Set())
  const [capsulePhase, setCapsulePhase] = useState<'closed' | 'words' | 'body' | 'gone'>('closed')
  const [opened, setOpened] = useState<OpenedCapsule | null>(null)
  const [capsulePhraseText, setCapsulePhraseText] = useState('')
  const [capsulePhraseSaved, setCapsulePhraseSaved] = useState(false)
  const timer = useRef<number | null>(null)

  const startPress = (i: number, text: string) => {
    timer.current = window.setTimeout(() => {
      setMarked((prev) => {
        if (prev.has(i) || prev.size >= 2) return prev
        void addPhrase(text, 'essay')
        return new Set(prev).add(i)
      })
    }, 550)
  }
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current)
  }

  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">再読</span>
        <div class="bar-right">
          <button class="ghost icon" onClick={onCapture} aria-label="言えなかったこと">
            +
          </button>
          <button class="ghost icon" onClick={onSettings} aria-label="設定">
            ⚙
          </button>
        </div>
      </header>

      <div class="section-label">今週のエッセイ</div>
      <p class="hint-static">{COPY.rereadMark}</p>
      {essay && essay.sentences.length > 0 ? (
        <ul class="sentences">
          {essay.sentences.map((s, i) => (
            <li
              key={i}
              class={marked.has(i) ? 'marked' : ''}
              onPointerDown={() => startPress(i, s.text)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
            >
              {s.text}
            </li>
          ))}
        </ul>
      ) : (
        <p class="empty">今週のエッセイはまだ空</p>
      )}

      {carryHistory.length > 0 && (
        <>
          <div class="section-label">問いの系譜</div>
          <ul class="carry-list">
            {carryHistory.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      )}

      {capsule && capsulePhase !== 'gone' && (
        <>
          <div class="section-label">タイムカプセル</div>
          {capsulePhase === 'closed' && (
            <div class="capsule-card">
              <p>
                {COPY.capsuleArrived}
                <span class="s-date">({capsule.week}の週)</span>
              </p>
              <div class="row">
                <button
                  class="primary"
                  onClick={() => {
                    void onOpenCapsule(capsule).then((o) => {
                      setOpened(o)
                      setCapsulePhase('words')
                    })
                  }}
                >
                  {COPY.capsuleOpen}
                </button>
                <button
                  class="ghost"
                  onClick={() => {
                    void onDiscardCapsule(capsule).then(() => setCapsulePhase('gone'))
                  }}
                >
                  {COPY.capsuleDiscard}
                </button>
              </div>
            </div>
          )}
          {capsulePhase === 'words' && opened && (
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
              <button class="ghost" onClick={() => setCapsulePhase('body')}>
                {COPY.capsuleReadBody}
              </button>
            </div>
          )}
          {capsulePhase === 'body' && opened && (
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
              <label class="field-label">{COPY.capsulePhraseAsk}</label>
              {capsulePhraseSaved ? (
                <span class="talk-done">✓</span>
              ) : (
                <div class="row">
                  <input
                    class="text-input"
                    value={capsulePhraseText}
                    onInput={(e: any) => setCapsulePhraseText(e.currentTarget.value)}
                  />
                  <button
                    class="ghost"
                    onClick={() => {
                      if (capsulePhraseText.trim()) {
                        void addPhrase(capsulePhraseText.trim(), 'capsule')
                        setCapsulePhraseSaved(true)
                      }
                    }}
                  >
                    保存
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <button class="primary" onClick={onDone}>
        今日はここまで
      </button>
    </div>
  )
}
