import { useState } from 'preact/hooks'
import { COPY } from '../lib/copy'

interface Props {
  onDone: (carry: string | null) => void
}

export function SessionC({ onDone }: Props) {
  const [q, setQ] = useState('')
  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">持ち越しの問い</span>
      </header>
      <input
        class="text-input big-input"
        value={q}
        placeholder={COPY.carryPlaceholder}
        onInput={(e: any) => setQ(e.currentTarget.value)}
      />
      <button class="primary" onClick={() => onDone(q.trim() || null)}>
        保存して終わる
      </button>
    </div>
  )
}
