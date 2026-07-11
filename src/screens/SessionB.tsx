import { useState } from 'preact/hooks'
import { COPY } from '../lib/copy'
import type { Essay } from '../lib/types'

interface Props {
  current: Essay | null
  last: Essay | null
  candidates: string[]
  onDone: (theme: string, recipient: string, sentence: string) => void
}

export function SessionB({ current, last, candidates, onDone }: Props) {
  const [phase, setPhase] = useState<'choose' | 'form' | 'write'>(
    current ? 'write' : last ? 'choose' : 'form'
  )
  const [theme, setTheme] = useState(current?.theme ?? '')
  const [recipient, setRecipient] = useState(current?.recipient ?? '')
  const [sentence, setSentence] = useState('')

  if (phase === 'choose' && last) {
    return (
      <div class="screen">
        <header class="bar">
          <span class="mode-label">エッセイ</span>
        </header>
        <div class="stack">
          <button
            class="primary big"
            onClick={() => {
              setTheme(last.theme)
              setRecipient(last.recipient)
              setPhase('write')
            }}
          >
            {COPY.themeContinue(last.theme)}
          </button>
          <button class="ghost" onClick={() => setPhase('form')}>
            {COPY.themeChange}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'form') {
    return (
      <div class="screen">
        <header class="bar">
          <span class="mode-label">エッセイ</span>
        </header>
        <label class="field-label">{COPY.themeAsk}</label>
        <input class="text-input" value={theme} onInput={(e: any) => setTheme(e.currentTarget.value)} />
        <div class="chips">
          {candidates.map((c) => (
            <button key={c} class="chip" onClick={() => setTheme(c)}>
              {c}
            </button>
          ))}
        </div>
        <label class="field-label">{COPY.recipientAsk}</label>
        <input
          class="text-input"
          value={recipient}
          onInput={(e: any) => setRecipient(e.currentTarget.value)}
          placeholder="名前かイニシャル(自分にだけ見える)"
        />
        <button
          class="primary"
          disabled={!theme.trim() || !recipient.trim()}
          onClick={() => setPhase('write')}
        >
          決める
        </button>
      </div>
    )
  }

  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">エッセイ</span>
      </header>
      <div class="essay-head">
        <div class="essay-theme">{theme}</div>
        <div class="essay-recipient">→ {recipient}</div>
      </div>
      {(current?.sentences.length ?? 0) > 0 && (
        <ul class="sentences readonly">
          {current!.sentences.map((s, i) => (
            <li key={i}>
              <span class="s-date">{s.date.slice(5)}</span> {s.text}
            </li>
          ))}
        </ul>
      )}
      <textarea
        class="sentence-input"
        rows={2}
        value={sentence}
        placeholder={COPY.essayPlaceholder(recipient)}
        onInput={(e: any) => setSentence(e.currentTarget.value)}
      />
      <button class="primary" onClick={() => onDone(theme, recipient, sentence)}>
        次へ
      </button>
    </div>
  )
}
