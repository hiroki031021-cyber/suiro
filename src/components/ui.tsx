import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'

/** L2「コーチの一言」: 一行+任意の「なぜ?」(§1) */
export function Hint({ text, why }: { text: string; why?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div class="hint fade-in" role="status">
      <span>{text}</span>
      {why && (
        <button class="why-btn" onClick={() => setOpen(!open)}>
          なぜ?
        </button>
      )}
      {open && why && <p class="why-text">{why}</p>}
    </div>
  )
}

/** 残り時間リング(数字は目立たせない §2.4) */
export function TimerRing({ progress }: { progress: number }) {
  const R = 9
  const C = 2 * Math.PI * R
  const p = Math.min(1, Math.max(0, progress))
  return (
    <svg viewBox="0 0 24 24" class="ring" aria-hidden="true">
      <circle cx="12" cy="12" r={R} class="ring-bg" />
      <circle
        cx="12"
        cy="12"
        r={R}
        class="ring-fg"
        stroke-dasharray={`${C}`}
        stroke-dashoffset={`${C * (1 - p)}`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  )
}

/** 週間ドット: 埋まった分だけ濃く、空は極薄。数字なし(§7.2) */
export function WeekDots({ dots }: { dots: boolean[] }) {
  return (
    <div class="week-dots" aria-hidden="true">
      {dots.map((filled, i) => (
        <span key={i} class={`dot ${filled ? 'on' : ''} ${i >= 5 ? 'weekend' : ''}`} />
      ))}
    </div>
  )
}

export function Screen({ title, children }: { title?: string; children: ComponentChildren }) {
  return (
    <div class="screen">
      {title && <div class="mode-label">{title}</div>}
      {children}
    </div>
  )
}
