import { useEffect, useRef, useState } from 'preact/hooks'
import { COPY } from '../lib/copy'
import type { CheckpointRecord } from '../lib/types'

interface Props {
  history: CheckpointRecord[] // 過去分(今月を含まない)
  prevTalkCount: number | null // 先月の声出し回数
  /** 録音済み・3指標未入力のまま中断した月の再入場(プロセス破棄対策) */
  resume: { audio?: ArrayBuffer; mimeType?: string } | null
  onRecorded: (audio: ArrayBuffer | null, mimeType: string | null) => Promise<void> // 録音完了=その日の完了(§7.1)
  onSaveMetrics: (m: { wordCount: number | null; fillerCount: number | null; silenceCount: number | null }) => Promise<void>
  onExit: () => void
}

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return null
}

/** 月1・第1日曜の定点観測(§3.6)。録音失敗時はタイマーのみのフォールバックで完了できる */
export function Checkpoint({ history, prevTalkCount, resume, onRecorded, onSaveMetrics, onExit }: Props) {
  const [phase, setPhase] = useState<'intro' | 'recording' | 'count' | 'done'>(resume ? 'count' : 'intro')
  const [seconds, setSeconds] = useState(60)
  const [audioUrl, setAudioUrl] = useState<string | null>(() => {
    if (resume?.audio && resume.mimeType) {
      return URL.createObjectURL(new Blob([resume.audio], { type: resume.mimeType }))
    }
    return null
  })
  const [micError, setMicError] = useState(false)
  const [wc, setWc] = useState('')
  const [fc, setFc] = useState('')
  const [sc, setSc] = useState('')

  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | null>(null)
  const mime = useRef<string | null>(null)
  const starting = useRef(false) // マイク許可待ち中の二度押し防止

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current)
      recorder.current?.stream.getTracks().forEach((t) => t.stop())
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    },
    []
  )

  const countdown = (onZero: () => void) => {
    if (timer.current) clearInterval(timer.current)
    setSeconds(60)
    timer.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          if (timer.current) clearInterval(timer.current)
          onZero()
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  const startRecording = async () => {
    if (starting.current) return
    starting.current = true
    const m = pickMime()
    if (!m || !navigator.mediaDevices?.getUserMedia) {
      setMicError(true)
      starting.current = false
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mime.current = m
      const rec = new MediaRecorder(stream, { mimeType: m })
      recorder.current = rec
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data)
      rec.onerror = () => setMicError(true)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        void (async () => {
          try {
            const blob = new Blob(chunks.current, { type: m })
            const buf = await blob.arrayBuffer()
            setAudioUrl(URL.createObjectURL(blob))
            await onRecorded(buf, m)
          } catch {
            // 保存に失敗しても指標入力へは進める(その日を人質にしない)
            try {
              await onRecorded(null, null)
            } catch {
              /* recordCompletion失敗時も入力自体はさせる */
            }
          } finally {
            setPhase('count')
          }
        })()
      }
      rec.start()
      setPhase('recording')
      countdown(() => rec.state !== 'inactive' && rec.stop())
    } catch {
      setMicError(true)
      starting.current = false
    }
  }

  const startFallback = () => {
    if (starting.current && phase === 'recording') return
    starting.current = true
    // マイクが使えない・拒否された日も、この日を人質にしない(監査指摘)
    setPhase('recording')
    countdown(() => {
      void onRecorded(null, null)
        .catch(() => undefined)
        .then(() => setPhase('count'))
    })
  }

  const save = async () => {
    const n = (v: string) => (v.trim() === '' ? null : Number(v))
    await onSaveMetrics({ wordCount: n(wc), fillerCount: n(fc), silenceCount: n(sc) })
    setPhase('done')
  }

  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">定点観測</span>
      </header>

      {phase === 'intro' && (
        <div class="stack">
          <p class="ck-prompt">「{COPY.ckPrompt}」</p>
          <button class="primary big" onClick={() => void startRecording()}>
            {COPY.ckStart}
          </button>
          {micError && (
            <>
              <p class="note">マイクが使えなかった。今月は声だけで残す:</p>
              <button class="ghost" onClick={startFallback}>
                {COPY.ckFallback}
              </button>
            </>
          )}
        </div>
      )}

      {phase === 'recording' && (
        <div class="stack">
          <p class="ck-prompt">「{COPY.ckPrompt}」</p>
          <div class="countdown">{seconds}</div>
        </div>
      )}

      {phase === 'count' && (
        <>
          <p class="hint-static">{COPY.ckCounting}</p>
          {audioUrl && <audio controls src={audioUrl} class="ck-audio" />}
          <label class="field-label">{COPY.ckWords}</label>
          <input class="text-input" type="number" inputmode="numeric" value={wc} onInput={(e: any) => setWc(e.currentTarget.value)} />
          <label class="field-label">{COPY.ckFillers}</label>
          <input class="text-input" type="number" inputmode="numeric" value={fc} onInput={(e: any) => setFc(e.currentTarget.value)} />
          <label class="field-label">{COPY.ckSilences}</label>
          <input class="text-input" type="number" inputmode="numeric" value={sc} onInput={(e: any) => setSc(e.currentTarget.value)} />
          <button class="primary" onClick={() => void save()}>
            {COPY.ckSave}
          </button>
        </>
      )}

      {phase === 'done' && (
        <>
          {prevTalkCount !== null && <p class="hint-static">{COPY.ckPrevTalk(prevTalkCount)}</p>}
          {history.length > 0 && (
            <div class="ck-history">
              {history.map((h) => (
                <div key={h.month} class="ck-row">
                  <span class="s-date">{h.month}</span>
                  <span>語数 {h.wordCount ?? '—'}</span>
                  <span>えー・あの {h.fillerCount ?? '—'}</span>
                  <span>沈黙 {h.silenceCount ?? '—'}</span>
                </div>
              ))}
            </div>
          )}
          <button class="primary" onClick={onExit}>
            閉じる
          </button>
        </>
      )}
    </div>
  )
}
