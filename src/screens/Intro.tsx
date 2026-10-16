import { COPY } from '../lib/copy'

export function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div class="screen center intro">
      <div class="mark">{COPY.appName}</div>
      <p class="lead">
        {COPY.introLead.map((l, i) => (
          <span key={i}>
            {l}
            <br />
          </span>
        ))}
      </p>
      <button class="primary big" onClick={onStart}>
        {COPY.introStart}
      </button>
    </div>
  )
}
