import { COPY } from '../lib/copy'
import type { Arrival } from '../lib/store'

interface Props {
  arrival: Arrival
  onDone: () => void
}

/** 3か月後・6か月後の見返し。さっと読む。直さない。読んだら次に進む */
export function Review({ arrival, onDone }: Props) {
  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">{arrival.date}</span>
      </header>
      <p class="hint-static">{COPY.reviewHint(arrival.round)}</p>
      {arrival.pages.map((p) => (
        <div key={p.id} class="old-sheet">
          <div class="old-title">{p.title || '(無題)'}</div>
          <ul class="old-lines">
            {p.body
              .split('\n')
              .filter((l) => l.trim())
              .map((l, i) => (
                <li key={i}>{l}</li>
              ))}
          </ul>
        </div>
      ))}
      <button class="primary" onClick={onDone}>
        {COPY.reviewDone}
      </button>
    </div>
  )
}
