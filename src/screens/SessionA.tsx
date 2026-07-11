import { useEffect, useRef, useState } from 'preact/hooks'
import { NonstopEditor } from '../components/NonstopEditor'
import { Hint, TimerRing } from '../components/ui'
import { COPY } from '../lib/copy'
import { hasInsightWord, meetsCompletion } from '../lib/metrics'
import { saveBonusDraft, saveDraft } from '../lib/store'
import { todayStr } from '../lib/clock'
import { EMOTION_WORDS } from '../data/emotionWords'
import type { Settings } from '../lib/types'

export interface SessionAResult {
  text: string
  emotion: string
  metrics: { chars: number; pauses: number; durationSec: number; hasInsightWord: boolean }
}

interface Props {
  settings: Settings
  minimal: boolean
  bonus: boolean
  question: string
  initialText: string
  initialEmotion: string
  initialVisibleMs: number
  initialPauses: number
  showEmotion: boolean
  onFinish: (r: SessionAResult) => void
  onPause: () => void
  onBackspaceHintShown: () => void
  onSettings: () => void
}

export function SessionA(props: Props) {
  const { settings } = props
  const duration = settings.drainSeconds * 1000

  const [emotion, setEmotion] = useState(props.initialEmotion)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [hint, setHint] = useState<{ text: string; why?: string } | null>(null)
  const [footHint, setFootHint] = useState<string | null>(null)
  const [ended, setEnded] = useState(props.initialVisibleMs >= duration)
  const [progress, setProgress] = useState(props.initialVisibleMs / duration)
  const [ok, setOk] = useState(meetsCompletion(props.initialText))

  const text = useRef(props.initialText)
  const getLive = useRef<() => string>(() => text.current)
  const emotionRef = useRef(props.initialEmotion)
  const visibleMs = useRef(props.initialVisibleMs)
  const lastActivity = useRef(Date.now())
  const pauses = useRef(props.initialPauses)
  const gapCounted = useRef(false)
  const stallShown = useRef(false)
  const insightShown = useRef(false)
  const pasteHintShown = useRef(false)
  const backspaceHintDone = useRef(settings.backspaceHintShown)
  const saveTimer = useRef<number | null>(null)
  const longPress = useRef<number | null>(null)
  const finished = useRef(false)

  const persistDraft = () => {
    if (finished.current) return
    if (props.bonus) {
      // 書き足しは別キーへ。settleStaleDraftの遡及完了対象にしない(§2.1)
      void saveBonusDraft({ date: todayStr(), text: text.current, emotionWord: emotionRef.current })
      return
    }
    void saveDraft({
      date: todayStr(),
      question: props.question,
      text: text.current,
      emotionWord: emotionRef.current,
      pauses: pauses.current,
      visibleMs: visibleMs.current,
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
      setProgress(visibleMs.current / duration)
      const idle = Date.now() - lastActivity.current
      const stallAfter = matchMedia('(pointer: coarse)').matches ? 8000 : 5000
      if (idle >= 5000 && !gapCounted.current) {
        pauses.current += 1
        gapCounted.current = true
      }
      if (idle >= stallAfter && !stallShown.current) {
        stallShown.current = true
        setHint({ text: COPY.stall, why: COPY.stallWhy })
      }
      if (
        !insightShown.current &&
        duration >= 120000 &&
        visibleMs.current >= duration - 60000 &&
        !hasInsightWord(getLive.current()) &&
        !props.minimal
      ) {
        insightShown.current = true
        setFootHint(COPY.insight)
      }
      if (visibleMs.current >= duration) setEnded(true)
    }, 250)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        // 復帰直後の停止検出誤発火を抑止(§11.5)
        lastActivity.current = Date.now()
      } else {
        syncLive()
        persistDraft()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const activity = () => {
    lastActivity.current = Date.now()
    gapCounted.current = false
  }

  /** composition確定待ちのままボタンが押されても本文を取りこぼさないよう、live値で同期する */
  const syncLive = () => {
    text.current = getLive.current()
  }

  const finish = () => {
    if (finished.current) return
    syncLive()
    finished.current = true
    props.onFinish({
      text: text.current,
      emotion: emotionRef.current,
      metrics: {
        chars: text.current.length,
        pauses: pauses.current,
        durationSec: Math.round(visibleMs.current / 1000),
        hasInsightWord: hasInsightWord(text.current),
      },
    })
  }

  const pause = () => {
    syncLive()
    persistDraft()
    props.onPause()
  }

  const headerAction = () => {
    syncLive()
    if (meetsCompletion(text.current)) finish()
    else pause()
  }

  const blockedDelete = () => {
    if (!backspaceHintDone.current) {
      backspaceHintDone.current = true
      setHint({ text: COPY.backspaceFirst, why: COPY.backspaceFirstWhy })
      props.onBackspaceHintShown()
    }
  }

  const blockedPaste = () => {
    if (!pasteHintShown.current) {
      pasteHintShown.current = true
      setHint({ text: COPY.paste, why: COPY.pasteWhy })
    }
  }

  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">{props.bonus ? '書き足し' : '排水'}</span>
        <div class="bar-right">
          <button class="ghost icon" onClick={props.onSettings} aria-label="設定">
            ⚙
          </button>
          <button class="ghost" onClick={headerAction}>
            今日はここまで
          </button>
        </div>
      </header>

      {props.minimal && <Hint text={COPY.oneSentenceDay} why={COPY.oneSentenceDayWhy} />}

      {props.showEmotion && (
        <div class="emotion-row">
          <input
            class="emotion-input"
            value={emotion}
            placeholder={COPY.emotionPlaceholder}
            onInput={(e: any) => {
              activity()
              setEmotion(e.currentTarget.value)
              emotionRef.current = e.currentTarget.value
              schedulePersist()
            }}
            onPointerDown={() => {
              longPress.current = window.setTimeout(() => setHint({ text: COPY.emotionLongPress }), 550)
            }}
            onPointerUp={() => longPress.current && clearTimeout(longPress.current)}
            onPointerLeave={() => longPress.current && clearTimeout(longPress.current)}
          />
          <button class="ghost" onClick={() => setPaletteOpen(!paletteOpen)}>
            語
          </button>
        </div>
      )}
      {paletteOpen && (
        <div class="palette">
          {EMOTION_WORDS.map((w) => (
            <button
              key={w}
              class="chip"
              onClick={() => {
                activity()
                setEmotion(w)
                emotionRef.current = w
                setPaletteOpen(false)
                schedulePersist()
              }}
            >
              {w}
            </button>
          ))}
        </div>
      )}

      <div class="question">{props.question}</div>

      <NonstopEditor
        initial={props.initialText}
        placeholder={settings.addresseeTemplate}
        register={(g) => {
          getLive.current = g
        }}
        onChange={(t) => {
          text.current = t
          setOk(meetsCompletion(t))
          schedulePersist()
        }}
        onActivity={activity}
        onBlockedDelete={blockedDelete}
        onBlockedPaste={blockedPaste}
      />

      <div class="timer-row">
        <TimerRing progress={progress} />
        {ended && (
          <div class="end-line fade-in">
            <span>{COPY.timerEnd}</span>
            <button
              class="primary"
              disabled={!ok}
              onClick={() => {
                syncLive()
                if (meetsCompletion(text.current)) finish()
              }}
            >
              次へ
            </button>
          </div>
        )}
      </div>

      {footHint && <div class="foot-hint fade-in">{footHint}</div>}
      {hint && <Hint text={hint.text} why={hint.why} />}
    </div>
  )
}
