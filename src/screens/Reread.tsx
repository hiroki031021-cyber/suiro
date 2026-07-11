import { useRef, useState } from 'preact/hooks'
import { COPY } from '../lib/copy'
import { addPhrase } from '../lib/store'
import type { Essay } from '../lib/types'

interface Props {
  essay: Essay | null
  carryHistory: string[]
  onDone: () => void
  onSettings: () => void
}

/** 金曜: 書かない日(§3.3)。マークは長押し・2つまで(レール) */
export function Reread({ essay, carryHistory, onDone, onSettings }: Props) {
  const [marked, setMarked] = useState<Set<number>>(new Set())
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

      <button class="primary" onClick={onDone}>
        今日はここまで
      </button>
    </div>
  )
}
