import { useEffect, useRef, useState } from 'preact/hooks'
import { COPY } from '../lib/copy'
import type { Essay } from '../lib/types'

interface Props {
  essay: Essay
  onReadDone: () => void // ステップ1「読んだ」= その日の完了(§7.1)
  onUpdateSentence: (idx: number, text: string) => void
  onArchive: (replyImagined: string) => void
  onExit: () => void
}

/** 週末: 音読リライト(§3.5) */
export function Revise({ essay, onReadDone, onUpdateSentence, onArchive, onExit }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [editing, setEditing] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [reply, setReply] = useState('')
  const iv = useRef<number | null>(null)

  useEffect(() => () => {
    if (iv.current) clearInterval(iv.current)
  }, [])

  const startCountdown = () => {
    setCountdown(30)
    iv.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c === null || c <= 1) {
          if (iv.current) clearInterval(iv.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">推敲 {step}/3</span>
      </header>
      <div class="essay-head">
        <div class="essay-theme">{essay.theme}</div>
        <div class="essay-recipient">→ {essay.recipient}</div>
      </div>

      {step === 1 && (
        <>
          <p class="hint-static">
            {COPY.reviseRead}
            <br />
            <span class="sub">{COPY.reviseVoiceSub}</span>
          </p>
          <div class="essay-full">
            {essay.sentences.map((s, i) => (
              <p key={i}>{s.text}</p>
            ))}
          </div>
          <button
            class="primary"
            onClick={() => {
              onReadDone()
              setStep(2)
            }}
          >
            {COPY.reviseReadDone}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <p class="hint-static">{COPY.reviseTap}</p>
          <ul class="sentences">
            {essay.sentences.map((s, i) => (
              <li key={i}>
                {editing === i ? (
                  <div class="edit-box">
                    <p class="hint-static">{COPY.reviseEditHint}</p>
                    <textarea
                      class="sentence-input"
                      rows={2}
                      value={editText}
                      onInput={(e: any) => setEditText(e.currentTarget.value)}
                    />
                    <button
                      class="primary"
                      onClick={() => {
                        onUpdateSentence(i, editText)
                        setEditing(null)
                      }}
                    >
                      直した
                    </button>
                  </div>
                ) : (
                  <button
                    class="sentence-btn"
                    onClick={() => {
                      setEditing(i)
                      setEditText(s.text)
                    }}
                  >
                    {s.text}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button class="primary" onClick={() => setStep(3)}>
            次へ
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <p class="hint-static">{COPY.reviseSummary}</p>
          <div class="essay-full blurred">
            {essay.sentences.map((s, i) => (
              <p key={i}>{s.text}</p>
            ))}
          </div>
          {countdown === null ? (
            <button class="primary" onClick={startCountdown}>
              30秒をはじめる
            </button>
          ) : countdown > 0 ? (
            <div class="countdown">{countdown}</div>
          ) : (
            <button class="primary" onClick={() => setStep(4)}>
              {COPY.reviseSummaryDone}
            </button>
          )}
        </>
      )}

      {step === 4 && (
        <div class="stack">
          {archiving ? (
            <>
              <label class="field-label">{COPY.archiveAsk(essay.recipient)}</label>
              <input
                class="text-input"
                value={reply}
                onInput={(e: any) => setReply(e.currentTarget.value)}
              />
              <button class="primary" onClick={() => onArchive(reply.trim())}>
                このエッセイを仕舞う
              </button>
            </>
          ) : (
            <>
              <button class="ghost" onClick={() => setArchiving(true)}>
                このエッセイを仕舞う
              </button>
              <button class="primary" onClick={onExit}>
                今週はここまで
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
