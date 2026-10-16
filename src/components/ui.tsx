/** 残り時間リング(数字は出さない) */
export function TimerRing({ progress }: { progress: number }) {
  const R = 9
  const C = 2 * Math.PI * R
  const p = Math.min(1, Math.max(0, progress))
  return (
    <svg viewBox="0 0 24 24" class="ring" aria-hidden="true">
      <circle cx="12" cy="12" r={R} class="ring-bg" />
      <circle cx="12" cy="12" r={R} class="ring-fg" stroke-dasharray={`${C}`} stroke-dashoffset={`${C * (1 - p)}`} transform="rotate(-90 12 12)" />
    </svg>
  )
}

/** 週の7ドット。枚数に応じて濃く。数字なし */
export function WeekDots({ counts, goal }: { counts: number[]; goal: number }) {
  return (
    <div class="week-dots" aria-hidden="true">
      {counts.map((c, i) => (
        <span key={i} class={`dot ${c >= goal ? 'full' : c > 0 ? 'some' : ''}`} />
      ))}
    </div>
  )
}
