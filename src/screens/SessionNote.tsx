import { useEffect, useRef, useState } from 'preact/hooks'
import { PlainEditor } from '../components/PlainEditor'
import { Hint, InlineHint, TimerRing } from '../components/ui'
import { COPY } from '../lib/copy'
import { meetsCompletion } from '../lib/metrics'
import { noteComplete, saveNoteDraft } from '../lib/store'
import { todayStr } from '../lib/clock'
import { NOTE_KEYS, type EvidenceKind, type NoteFields, type Settings } from '../lib/types'

export interface SessionNoteResult {
  fields: NoteFields
  evidenceKind: EvidenceKind | null
  hypothesisFrom: string | null
  durationSec: number
  /** ヘッダの「今日はここまで」で終えた(5秒の取り消しトーストを出す) */
  early: boolean
}

interface Props {
  settings: Settings
  minimal: boolean // ①②だけでいい日
  hypothesisFrom: string | null // 前日の仮説(①の上に添える)
  initialStep: number
  initialFields: NoteFields
  initialKind: EvidenceKind | null
  initialVisibleMs: number
  initialStepMs: number
  showDiffHint: boolean // 第2段階
  showTags: boolean // 第3段階
  onFinish: (r: SessionNoteResult) => void
  onPause: () => void
  onSettings: () => void
}

/** 各段の配分(分)。合計14。持ち時間(声の60秒を除く)に比例して伸縮する(§14.2) */
const STEP_MINUTES = [1, 4, 3, 4, 2]

/** 五つの段(§14.2): 1段1画面・前進のみ・項目内の言い直しは自由 */
export function SessionNote(props: Props) {
  const stepCount = props.minimal ? 2 : 5
  const writingMin = Math.max(5, props.settings.sessionMinutes - 1)
  const stepMs = (i: number) => (STEP_MINUTES[i] * writingMin * 60000) / 14

  const [step, setStep] = useState(Math.min(props.initialStep, stepCount - 1))
  const [fields, setFields] = useState<NoteFields>(props.initialFields)
  const [kind, setKind] = useState<EvidenceKind | null>(props.initialKind)
  const [progress, setProgress] = useState(props.initialStepMs / stepMs(props.initialStep))
  const [ended, setEnded] = useState(props.initialStepMs >= stepMs(props.initialStep))
  const [hint, setHint] = useState<{ text: string; why?: string } | null>(null)

  const stepRef = useRef(step)
  const fieldsRef = useRef(fields)
  const kindRef = useRef(kind)
  const visibleMs = useRef(props.initialVisibleMs)
  const curStepMs = useRef(props.initialStepMs)
  const saveTimer = useRef<number | null>(null)
  const finished = useRef(false)

  const persistDraft = () => {
    if (finished.current) return
    void saveNoteDraft({
      date: todayStr(),
      step: stepRef.current,
      fields: fieldsRef.current,
      evidenceKind: kindRef.current,
      hypothesisFrom: props.hypothesisFrom,
      visibleMs: visibleMs.current,
      stepMs: curStepMs.current,
    })
  }
  const schedulePersist = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(persistDraft, 300)
  }

  useEffect(() => {
    // 可視状態の累積時間で計測(§11.5)。バックグラウンドでは進まない
    const iv = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || finished.current) return
      visibleMs.current += 250
      curStepMs.current += 250
      const limit = stepMs(stepRef.current)
      setProgress(curStepMs.current / limit)
      if (curStepMs.current >= limit) setEnded(true)
    }, 250)
    const onVis = () => {
      if (document.visibilityState !== 'visible') persistDraft()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const key = NOTE_KEYS[step]
  const value = fields[key]

  const canAdvance = (() => {
    if (step === 1) return meetsCompletion(value)
    if (step === 3 && props.showTags && kind === null) return false
    return value.trim().length > 0
  })()

  const finish = (early: boolean) => {
    if (finished.current) return
    finished.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    // ヘッダ終了の取り消しに備え、下書きは残す(確定時にapp側で消す)
    void saveNoteDraft({
      date: todayStr(),
      step: stepRef.current,
      fields: fieldsRef.current,
      evidenceKind: kindRef.current,
      hypothesisFrom: props.hypothesisFrom,
      visibleMs: visibleMs.current,
      stepMs: curStepMs.current,
    })
    props.onFinish({
      fields: fieldsRef.current,
      evidenceKind: kindRef.current,
      hypothesisFrom: props.hypothesisFrom,
      durationSec: Math.round(visibleMs.current / 1000),
      early,
    })
  }

  const advance = () => {
    if (!canAdvance) return
    if (step >= stepCount - 1) {
      finish(false)
      return
    }
    stepRef.current = step + 1
    curStepMs.current = 0
    setProgress(0)
    setEnded(false)
    setHint(null)
    setStep(step + 1)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    persistDraft()
  }

  const headerAction = () => {
    if (noteComplete(fieldsRef.current)) {
      finish(true) // ヘッダからの終了は常に取り消し可(最終段でも⑤が空のまま終わり得る)
    } else {
      persistDraft()
      props.onPause()
    }
  }

  const setField = (t: string) => {
    const nf = { ...fieldsRef.current, [key]: t }
    fieldsRef.current = nf
    setFields(nf)
    schedulePersist()
  }

  const pickKind = (k: EvidenceKind) => {
    kindRef.current = k
    setKind(k)
    if (k === 'hypothesis') setHint({ text: COPY.hypothesisNote })
    else if (k === 'counter') setHint({ text: COPY.counterNote })
    else setHint(null)
    schedulePersist()
  }

  const def = COPY.steps[step]
  const circled = ['①', '②', '③', '④', '⑤'][step]

  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">
          {def.label} {step + 1}/{stepCount}
        </span>
        <div class="bar-right">
          <button class="ghost icon" onClick={props.onSettings} aria-label="設定">
            ⚙
          </button>
          <button class="ghost" onClick={headerAction}>
            今日はここまで
          </button>
        </div>
      </header>

      {props.minimal && step === 0 && <Hint text={COPY.oneSentenceDay} why={COPY.oneSentenceDayWhy} />}

      {step === 0 && props.hypothesisFrom && <div class="carry-line">{COPY.carryLine(props.hypothesisFrom)}</div>}

      <div class="step-dots" aria-hidden="true">
        {Array.from({ length: stepCount }, (_, i) => (
          <span key={i} class={`sdot ${i < step ? 'done' : i === step ? 'cur' : ''}`} />
        ))}
      </div>

      <div class="question">
        <span class="circled">{circled}</span> {def.q}
      </div>

      {step === 1 && props.showDiffHint && <InlineHint text={COPY.diffHint} why={COPY.diffHintWhy} />}

      {step === 3 && props.showTags && (
        <div class="tag-row">
          <span class="tag-ask">{COPY.tagAsk}</span>
          {(
            [
              ['ground', COPY.tagGround],
              ['counter', COPY.tagCounter],
              ['hypothesis', COPY.tagHypothesis],
            ] as [EvidenceKind, string][]
          ).map(([k, label]) => (
            <button key={k} class={`chip ${kind === k ? 'on' : ''}`} onClick={() => pickKind(k)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <PlainEditor key={step} initial={value} placeholder={def.ph} onChange={setField} autoFocus={step > 0} />

      <div class="timer-row">
        <TimerRing progress={progress} />
        {ended && <span class="end-line fade-in">{COPY.timerEnd}</span>}
        <button class="primary push-right" disabled={!canAdvance} onClick={advance}>
          {step >= stepCount - 1 ? COPY.noteFinish : COPY.noteNext}
        </button>
      </div>

      {hint && <Hint text={hint.text} why={hint.why} />}
    </div>
  )
}
