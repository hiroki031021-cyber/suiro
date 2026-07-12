import { useEffect, useRef, useState } from 'preact/hooks'
import { NonstopEditor, type EditorApi } from '../components/NonstopEditor'
import { Hint } from '../components/ui'
import { COPY } from '../lib/copy'
import { hasInsightWord, meetsCompletion, stripDigQuestions } from '../lib/metrics'
import { saveDraft } from '../lib/store'
import { todayStr } from '../lib/clock'
import type { Settings } from '../lib/types'

export interface SessionDigResult {
  text: string
  question: string // Q1(持ち越しの問い消費判定用)
  metrics: { chars: number; pauses: number; durationSec: number; hasInsightWord: boolean }
}

interface Props {
  settings: Settings
  questions: string[] // 5問(Q1は持ち越しの問いに差し替え済み)
  initialStep: number
  initialText: string // これまでの全文(Q行込み)。現在ステップの回答も末尾に含む
  initialFirstAnswer: string
  initialVisibleMs: number
  initialPauses: number
  onFinish: (r: SessionDigResult) => void
  onPause: () => void
  onBackspaceHintShown: () => void
  onSettings: () => void
  onCapture: () => void
}

/** 問いガイド(§3.2): 1問1画面・戻れない・回答は日記と同じロック扱い */
export function SessionDig(props: Props) {
  const { questions } = props

  // prefix = 確定済みブロック(過去のQ&A+現在のQ行)。text = prefix + 現在の回答
  const initialPrefix = (() => {
    // 復元: initialTextから現在ステップのQ行までをprefixとみなす
    const qLine = `Q. ${questions[props.initialStep]}\n`
    const idx = props.initialText.lastIndexOf(qLine)
    if (idx >= 0) return props.initialText.slice(0, idx + qLine.length)
    return `Q. ${questions[0]}\n`
  })()

  const [step, setStep] = useState(props.initialStep)
  const [hint, setHint] = useState<{ text: string; why?: string } | null>(null)
  const [ok, setOk] = useState(
    props.initialStep > 0 || meetsCompletion(props.initialText.slice(initialPrefix.length))
  )

  const stepRef = useRef(props.initialStep)
  const prefix = useRef(initialPrefix)
  const answer = useRef(props.initialText.slice(initialPrefix.length))
  const firstAnswer = useRef(props.initialFirstAnswer)
  const api = useRef<EditorApi | null>(null)
  const visibleMs = useRef(props.initialVisibleMs)
  const lastActivity = useRef(Date.now())
  const pauses = useRef(props.initialPauses)
  const gapCounted = useRef(false)
  const backspaceHintDone = useRef(props.settings.backspaceHintShown)
  const saveTimer = useRef<number | null>(null)
  const finished = useRef(false)

  const getLive = () => api.current?.getValue() ?? answer.current
  const fullText = () => prefix.current + getLive()

  const persistDraft = () => {
    if (finished.current) return
    // stateのstepはクロージャで古くなり得るためrefを使う(advance直後のデバウンス発火対策)
    void saveDraft({
      date: todayStr(),
      question: questions[0],
      text: fullText(),
      emotionWord: '',
      pauses: pauses.current,
      visibleMs: visibleMs.current,
      digStep: stepRef.current,
      digFirstAnswer: stepRef.current === 0 ? getLive() : firstAnswer.current,
    })
  }
  const schedulePersist = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(persistDraft, 300)
  }

  useEffect(() => {
    const iv = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || finished.current) return
      visibleMs.current += 250
      const idle = Date.now() - lastActivity.current
      if (idle >= 5000 && !gapCounted.current) {
        pauses.current += 1
        gapCounted.current = true
      }
    }, 250)
    const onVis = () => {
      if (document.visibilityState === 'visible') lastActivity.current = Date.now()
      else persistDraft()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [step])

  const finish = () => {
    if (finished.current) return
    finished.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const text = fullText()
    props.onFinish({
      text,
      question: questions[0],
      metrics: {
        chars: text.length,
        pauses: pauses.current,
        durationSec: Math.round(visibleMs.current / 1000),
        // Q行(「要するに…?」等)が洞察語判定を汚染しないよう回答部分のみで判定
        hasInsightWord: hasInsightWord(stripDigQuestions(text)),
      },
    })
  }

  const advance = () => {
    // 仕掛かり中のデバウンス保存をキャンセルし、明示的な値で保存する(旧クロージャの上書き防止)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const ans = getLive()
    if (step === 0) {
      if (!meetsCompletion(ans)) return
      firstAnswer.current = ans
    }
    answer.current = ans
    if (step >= questions.length - 1) {
      finish()
      return
    }
    prefix.current = `${prefix.current}${ans}\n\nQ. ${questions[step + 1]}\n`
    answer.current = ''
    stepRef.current = step + 1
    setOk(false)
    setStep(step + 1)
    void saveDraft({
      date: todayStr(),
      question: questions[0],
      text: prefix.current,
      emotionWord: '',
      pauses: pauses.current,
      visibleMs: visibleMs.current,
      digStep: stepRef.current,
      digFirstAnswer: firstAnswer.current,
    })
  }

  const headerAction = () => {
    // 1問目に1文あれば完了(§7.1)。過去のステップは再表示しない(後戻り禁止)
    const done = step > 0 || meetsCompletion(getLive())
    if (done) {
      answer.current = getLive()
      finish()
    } else {
      persistDraft()
      props.onPause()
    }
  }

  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">問いガイド {step + 1}/5</span>
        <div class="bar-right">
          <button class="ghost icon" onClick={props.onCapture} aria-label="言えなかったこと">
            +
          </button>
          <button class="ghost icon" onClick={props.onSettings} aria-label="設定">
            ⚙
          </button>
          <button class="ghost" onClick={headerAction}>
            今日はここまで
          </button>
        </div>
      </header>

      <div class="question">{questions[step]}</div>

      <NonstopEditor
        key={step}
        initial={answer.current}
        placeholder=""
        register={(a) => {
          api.current = a
        }}
        onChange={(t) => {
          answer.current = t
          if (step === 0) setOk(meetsCompletion(t))
          schedulePersist()
        }}
        onActivity={() => {
          lastActivity.current = Date.now()
          gapCounted.current = false
        }}
        onBlockedDelete={() => {
          if (!backspaceHintDone.current) {
            backspaceHintDone.current = true
            setHint({ text: COPY.backspaceFirst, why: COPY.backspaceFirstWhy })
            props.onBackspaceHintShown()
          }
        }}
        onBlockedPaste={() => setHint({ text: COPY.paste, why: COPY.pasteWhy })}
      />

      <div class="timer-row">
        <button class="primary" disabled={step === 0 && !ok} onClick={advance}>
          {step >= questions.length - 1 ? COPY.digFinish : COPY.digNext}
        </button>
      </div>

      {hint && <Hint text={hint.text} why={hint.why} />}
    </div>
  )
}
