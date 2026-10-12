import { useEffect, useRef, useState } from 'preact/hooks'
import { PlainEditor } from '../components/PlainEditor'
import { Hint, InlineHint, TimerRing } from '../components/ui'
import { COPY } from '../lib/copy'
import { meetsCompletion } from '../lib/metrics'
import { noteComplete, saveNoteDraft } from '../lib/store'
import { todayStr } from '../lib/clock'
import {
  NOTE_KEYS,
  hasGap,
  linksAnswered,
  type EvidenceKind,
  type LinkState,
  type NoteFields,
  type NoteLinks,
  type Settings,
} from '../lib/types'

export interface SessionNoteResult {
  fields: NoteFields
  evidenceKind: EvidenceKind | null
  hypothesisFrom: string | null
  links: NoteLinks
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
  initialLinks: NoteLinks
  initialVisibleMs: number
  initialStepMs: number
  showDiffHint: boolean // 第2段階
  showTags: boolean // 第3段階
  onFinish: (r: SessionNoteResult) => void
  onPause: () => void
  onSettings: () => void
}

/** 各段の配分(分)。①〜⑤+つなぎで合計14。持ち時間(声の60秒を除く)に比例して伸縮する(§14.2) */
const STEP_MINUTES = [1, 4, 3, 4, 1, 1]
const LINK_STEP = 5
const CIRCLED = ['①', '②', '③', '④', '⑤']

/** 五つの段(§14.2)+つなぎ(§14.11): 1段1画面・前進のみ・項目内の言い直しは自由 */
export function SessionNote(props: Props) {
  const stepCount = props.minimal ? 2 : 6
  const writingMin = Math.max(5, props.settings.sessionMinutes - 1)
  const stepMs = (i: number) => (STEP_MINUTES[i] * writingMin * 60000) / 14

  const [step, setStep] = useState(Math.min(props.initialStep, stepCount - 1))
  const [fields, setFields] = useState<NoteFields>(props.initialFields)
  const [kind, setKind] = useState<EvidenceKind | null>(props.initialKind)
  const [links, setLinks] = useState<NoteLinks>(props.initialLinks)
  const [progress, setProgress] = useState(props.initialStepMs / stepMs(props.initialStep))
  const [ended, setEnded] = useState(props.initialStepMs >= stepMs(props.initialStep))
  const [hint, setHint] = useState<{ text: string; why?: string } | null>(null)

  const stepRef = useRef(step)
  const fieldsRef = useRef(fields)
  const kindRef = useRef(kind)
  const linksRef = useRef(links)
  const visibleMs = useRef(props.initialVisibleMs)
  const curStepMs = useRef(props.initialStepMs)
  const saveTimer = useRef<number | null>(null)
  const finished = useRef(false)

  const draft = () => ({
    date: todayStr(),
    step: stepRef.current,
    fields: fieldsRef.current,
    evidenceKind: kindRef.current,
    hypothesisFrom: props.hypothesisFrom,
    links: linksRef.current,
    visibleMs: visibleMs.current,
    stepMs: curStepMs.current,
  })
  const persistDraft = () => {
    if (finished.current) return
    void saveNoteDraft(draft())
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

  const isLink = step === LINK_STEP
  const key = NOTE_KEYS[Math.min(step, 4)]
  const value = fields[key]

  const canAdvance = (() => {
    if (isLink) return linksAnswered(links)
    if (step === 1) return meetsCompletion(value)
    if (step === 3 && props.showTags && kind === null) return false
    return value.trim().length > 0
  })()

  const finish = (early: boolean) => {
    if (finished.current) return
    finished.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    // ヘッダ終了の取り消しに備え、下書きは残す(確定時にapp側で消す)
    void saveNoteDraft(draft())
    props.onFinish({
      fields: fieldsRef.current,
      evidenceKind: kindRef.current,
      hypothesisFrom: props.hypothesisFrom,
      links: linksRef.current,
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

  const setLink = (k: keyof NoteLinks, v: LinkState) => {
    const nl = { ...linksRef.current, [k]: v }
    linksRef.current = nl
    setLinks(nl)
    if (hasGap(nl)) setHint({ text: COPY.gapNote, why: COPY.gapNoteWhy })
    else setHint(null)
    schedulePersist()
  }

  const label = isLink ? COPY.linkLabel : COPY.steps[step].label
  const question = isLink ? COPY.linkQ : COPY.steps[step].q
  const fieldAt = (i: number) => fields[NOTE_KEYS[i]]

  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">
          {label} {step + 1}/{stepCount}
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

      {/* ③④⑤は②を見ながら書く(ずれの予防 §14.11) */}
      {step >= 2 && step <= 4 && (
        <div class="anchor">
          <span class="circled">②</span>
          <span class="anchor-text">{fields.insight}</span>
        </div>
      )}

      <div class="question">
        {!isLink && <span class="circled">{CIRCLED[step]}</span>} {question}
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

      {isLink ? (
        <div class="link-list">
          {COPY.linkPairs.map((p) => (
            <div key={p.key} class="link-pair">
              <div class="link-texts">
                <p>
                  <span class="circled">{CIRCLED[p.a]}</span>
                  {fieldAt(p.a)}
                </p>
                <p>
                  <span class="circled">{CIRCLED[p.b]}</span>
                  {fieldAt(p.b)}
                </p>
              </div>
              <div class="link-test">{p.test}</div>
              <div class="tag-row">
                <button class={`chip ${links[p.key] === 'ok' ? 'on' : ''}`} onClick={() => setLink(p.key, 'ok')}>
                  {COPY.linkOk}
                </button>
                <button class={`chip ${links[p.key] === 'gap' ? 'on gap' : ''}`} onClick={() => setLink(p.key, 'gap')}>
                  {COPY.linkGap}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <PlainEditor key={step} initial={value} placeholder={COPY.steps[step].ph} onChange={setField} autoFocus={step > 0} />
      )}

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
