import { useEffect, useRef, useState } from 'preact/hooks'
import { TimerRing } from '../components/ui'
import { COPY } from '../lib/copy'
import { pageHasBody, saveDraft } from '../lib/store'
import { todayStr } from '../lib/clock'
import type { Draft, Settings } from '../lib/types'

export interface SheetResult {
  title: string
  body: string
  durationMs: number
  parentId?: string
}

interface Props {
  settings: Settings
  index: number // 今日の何枚目か(0始まり)
  draft: Draft | null // 同日の書きかけ
  presetTitle: string | null // 深掘り: 前の紙の1行
  parentId?: string
  onClose: (r: SheetResult | null) => void // null=空の紙(残らない)
  onFinishToday: (r: SheetResult | null) => void // 書きかけがあれば紙として残してから終える
  onSettings: () => void
  onTakeTitle: () => string // 題バンクから1つ
}

/**
 * 1枚の紙。書き始めた瞬間から60秒。閉じたら変更できない。
 * 入力欄は普通のinput/textarea(削除可)。速さは締め切りで守る。
 */
export function Sheet(props: Props) {
  const limit = props.settings.secondsPerPage * 1000
  const [title, setTitle] = useState(props.draft?.title ?? props.presetTitle ?? '')
  const [body, setBody] = useState(props.draft?.body ?? '')
  const [elapsed, setElapsed] = useState(props.draft?.elapsedMs ?? 0)
  const [closed, setClosed] = useState((props.draft?.elapsedMs ?? 0) >= limit)
  const [hint, setHint] = useState<string | null>(null)

  const st = useRef({ title, body, elapsed, closed })
  st.current = { title, body, elapsed, closed }
  const started = useRef((props.draft?.elapsedMs ?? 0) > 0 || !!props.presetTitle)
  const titleEl = useRef<HTMLInputElement>(null)
  const bodyEl = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<number | null>(null)
  const finished = useRef(false)

  const persist = () => {
    if (finished.current) return
    const s = st.current
    void saveDraft({ date: todayStr(), title: s.title, body: s.body, elapsedMs: s.elapsed, parentId: props.parentId })
  }
  const schedulePersist = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(persist, 300)
  }

  const close = () => {
    const s = st.current
    setClosed(true)
    titleEl.current?.blur()
    bodyEl.current?.blur()
    setHint(pageHasBody(s.title, s.body) ? COPY.closed : COPY.closedEmpty)
    persist()
  }

  useEffect(() => {
    // 可視状態の累積で計測(バックグラウンドでは進まない)。前面復帰時はそのまま続き
    const iv = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || finished.current) return
      const s = st.current
      if (!started.current || s.closed) return
      const next = s.elapsed + 250
      setElapsed(next)
      if (next >= limit) close()
    }, 250)
    const onVis = () => {
      if (document.visibilityState !== 'visible') persist()
    }
    document.addEventListener('visibilitychange', onVis)
    const el = props.presetTitle ? bodyEl.current : titleEl.current
    el?.focus()
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const start = () => {
    if (!started.current) {
      started.current = true
      setHint(COPY.startHint)
      window.setTimeout(() => setHint((h) => (h === COPY.startHint ? null : h)), 2500)
    }
  }

  const grow = (ta: HTMLTextAreaElement) => {
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(ta.scrollHeight, 180)}px`
  }

  const finishSheet = () => {
    if (finished.current) return
    finished.current = true
    const s = st.current
    props.onClose(
      pageHasBody(s.title, s.body)
        ? { title: s.title.trim(), body: s.body.trim(), durationMs: s.elapsed, parentId: props.parentId }
        : null
    )
  }

  const takeTitle = () => {
    if (st.current.closed || st.current.title.trim()) return
    const t = props.onTakeTitle()
    setTitle(t)
    start()
    schedulePersist()
    bodyEl.current?.focus()
  }

  const lines = body.split('\n').filter((l) => l.trim()).length
  const hasBody = pageHasBody(title, body)

  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">
          {props.index + 1}/{props.settings.pagesPerDay}
        </span>
        <div class="bar-right">
          <button class="ghost icon" onClick={props.onSettings} aria-label="設定">
            ⚙
          </button>
          <button
            class="ghost"
            onClick={() => {
              if (finished.current) return
              finished.current = true
              const s = st.current
              props.onFinishToday(
                pageHasBody(s.title, s.body)
                  ? { title: s.title.trim(), body: s.body.trim(), durationMs: s.elapsed, parentId: props.parentId }
                  : null
              )
            }}
          >
            {COPY.finishToday}
          </button>
        </div>
      </header>

      <div class="sheet">
        <div class="sheet-top">
          <input
            ref={titleEl}
            class="sheet-title"
            value={title}
            placeholder={COPY.titlePh}
            disabled={closed}
            autocapitalize="none"
            autocomplete="off"
            enterkeyhint="next"
            onInput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value
              if (v.trim()) start()
              setTitle(v)
              schedulePersist()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !(e as KeyboardEvent).isComposing && e.keyCode !== 229) {
                e.preventDefault()
                bodyEl.current?.focus()
              }
            }}
          />
          <span class="sheet-date">{todayStr().slice(5).replace('-', '/')}</span>
        </div>
        <textarea
          ref={bodyEl}
          class="sheet-body"
          value={body}
          placeholder={COPY.bodyPh}
          disabled={closed}
          rows={6}
          autocapitalize="none"
          onInput={(e) => {
            const ta = e.currentTarget as HTMLTextAreaElement
            if (ta.value.trim()) start()
            setBody(ta.value)
            grow(ta)
            schedulePersist()
          }}
        />
        <div class="sheet-foot">
          <TimerRing progress={elapsed / limit} />
          <span class="lines">{COPY.linesOf(lines)}</span>
          {!closed && !title.trim() && !body.trim() && (
            <button class="ghost" onClick={takeTitle}>
              {COPY.getTitle}
            </button>
          )}
          {!closed && started.current && (
            <button class="ghost push-right" onClick={close}>
              {COPY.next}
            </button>
          )}
        </div>
      </div>

      {closed && (
        <div class="closed-panel fade-in">
          {hasBody && body.trim() && (
            <>
              <p class="hint-static">{COPY.deepDive}</p>
              <ul class="dive-lines">
                {body
                  .split('\n')
                  .filter((l) => l.trim())
                  .map((l, i) => (
                    <li key={i}>
                      <button
                        class="dive-btn"
                        onClick={() => {
                          if (finished.current) return
                          finished.current = true
                          props.onClose({ title: title.trim(), body: body.trim(), durationMs: elapsed, parentId: props.parentId, ...{ nextTitle: l.trim() } } as SheetResult & { nextTitle: string })
                        }}
                      >
                        {l}
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
          <div class="row">
            <button class="primary" onClick={finishSheet}>
              {COPY.next}
            </button>
            {hasBody && title.trim() && (
              <button
                class="ghost"
                onClick={() => {
                  if (finished.current) return
                  finished.current = true
                  props.onClose({ title: title.trim(), body: body.trim(), durationMs: elapsed, parentId: props.parentId, ...{ nextTitle: title.trim() } } as SheetResult & { nextTitle: string })
                }}
              >
                {COPY.sameTitle}
              </button>
            )}
          </div>
        </div>
      )}

      {hint && (
        <div class="hint fade-in" role="status">
          {hint}
        </div>
      )}
    </div>
  )
}
