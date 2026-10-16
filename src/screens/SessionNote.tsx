import { useEffect, useRef, useState } from 'preact/hooks'
import { PlainEditor } from '../components/PlainEditor'
import { StrictInput } from '../components/StrictInput'
import { Hint, InlineHint, TimerRing } from '../components/ui'
import { COPY } from '../lib/copy'
import { TITLE_BANK } from '../data/titleBank'
import { draftComplete, memoHasBody, saveNoteDraft, type NoteInput } from '../lib/store'
import { todayStr } from '../lib/clock'
import {
  EMPTY_CONDITIONS,
  EMPTY_LINKS,
  conditionsAnswered,
  conditionsCount,
  hasGap,
  linksAnswered,
  type IssueConditions,
  type LinkState,
  type Memo,
  type NoteDraft,
  type NoteLinks,
  type Phase,
  type Settings,
} from '../lib/types'

export interface SessionNoteResult extends NoteInput {
  /** ヘッダの「今日はここまで」で終えた(5秒の取り消しトーストを出す) */
  early: boolean
}

interface Props {
  settings: Settings
  minimal: boolean // メモ2枚だけでいい日
  issueFrom: string | null // 前日のイシュー(メモ1の上に添える)
  draft: NoteDraft | null // 同日の書きかけ
  stages: { issue: boolean; sky: boolean; conditions: boolean } // 段階2・3・4
  onFinish: (r: SessionNoteResult) => void
  onPause: () => void
  onSettings: () => void
}

const MEMO_MS = 60000 // ゼロ秒メモは原著どおり1分固定
const MAX_LINES = 6
const MEMO_COUNT = 5
/** メモ以降の配分(分): イシュー2・空2・雨2.5・傘1.5・つなぎ1 = 9。持ち時間に比例して伸縮 */
const PHASE_MINUTES: Record<Exclude<Phase, 'memo'>, number> = { issue: 2, sky: 2, rain: 2.5, umbrella: 1.5, links: 1 }

/** メモ→イシュー→空雨傘(§15): 1段1画面・前進のみ。メモだけ削除不可・60秒凍結 */
export function SessionNote(props: Props) {
  const d = props.draft
  const memoTotal = props.minimal ? 2 : MEMO_COUNT
  const phases: Phase[] = props.minimal
    ? ['memo']
    : (['memo', ...(props.stages.issue ? ['issue' as const] : []), ...(props.stages.sky ? ['sky' as const, 'rain' as const, 'umbrella' as const] : []), ...(props.stages.sky && props.stages.conditions ? ['links' as const] : [])] as Phase[])
  const restMin = Math.max(4, props.settings.sessionMinutes - 1 - MEMO_COUNT)
  const phaseMs = (p: Phase) => (p === 'memo' ? MEMO_MS : (PHASE_MINUTES[p] * restMin * 60000) / 9)

  const [phase, setPhase] = useState<Phase>(d?.phase && phases.includes(d.phase) ? d.phase : 'memo')
  const [memos, setMemos] = useState<Memo[]>(d?.memos ?? [])
  const [title, setTitle] = useState(d?.cur?.title ?? '')
  const [lines, setLines] = useState<string[]>(d?.cur?.lines ?? [])
  const [line, setLine] = useState(d?.cur?.line ?? '')
  const [memoMs, setMemoMs] = useState(d?.cur?.elapsedMs ?? 0)
  const [frozen, setFrozen] = useState((d?.cur?.elapsedMs ?? 0) >= MEMO_MS)
  const [issue, setIssue] = useState(d?.issue ?? '')
  const [issueFromMemo, setIssueFromMemo] = useState<number | null>(d?.issueFromMemo ?? null)
  const [pickOther, setPickOther] = useState(false)
  const [cond, setCond] = useState<IssueConditions>(d?.conditions ?? EMPTY_CONDITIONS)
  const [sky, setSky] = useState(d?.sky ?? '')
  const [rain, setRain] = useState(d?.rain ?? '')
  const [umbrella, setUmbrella] = useState(d?.umbrella ?? '')
  const [links, setLinks] = useState<NoteLinks>(d?.links ?? EMPTY_LINKS)
  const [progress, setProgress] = useState(0)
  const [ended, setEnded] = useState(false)
  const [hint, setHint] = useState<{ text: string; why?: string } | null>(null)
  const [bankIdx, setBankIdx] = useState(() => Math.floor(Math.random() * TITLE_BANK.length))

  // タイマー・保存用に最新値をrefにも持つ(interval内のクロージャ対策)
  const st = useRef({ phase, memos, title, lines, line, memoMs, frozen, issue, issueFromMemo, cond, sky, rain, umbrella, links })
  st.current = { phase, memos, title, lines, line, memoMs, frozen, issue, issueFromMemo, cond, sky, rain, umbrella, links }
  const visibleMs = useRef(d?.visibleMs ?? 0)
  const stepMs = useRef(d?.stepMs ?? 0)
  const memoStarted = useRef((d?.cur?.elapsedMs ?? 0) > 0)
  const saveTimer = useRef<number | null>(null)
  const finished = useRef(false)
  const lineEl = useRef<HTMLInputElement | null>(null)
  const titleEl = useRef<HTMLInputElement | null>(null)
  const deleteHintShown = useRef(false)

  const buildDraft = (): NoteDraft => {
    const s = st.current
    return {
      date: todayStr(),
      phase: s.phase,
      memos: s.memos,
      cur: s.phase === 'memo' ? { title: s.title, lines: s.lines, line: s.line, elapsedMs: s.memoMs } : null,
      issue: s.issue,
      issueFromMemo: s.issueFromMemo,
      conditions: s.cond,
      sky: s.sky,
      rain: s.rain,
      umbrella: s.umbrella,
      links: s.links,
      issueFrom: props.issueFrom,
      visibleMs: visibleMs.current,
      stepMs: stepMs.current,
    }
  }
  const persist = () => {
    if (finished.current) return
    void saveNoteDraft(buildDraft())
  }
  const schedulePersist = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(persist, 300)
  }

  useEffect(() => {
    const iv = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || finished.current) return
      visibleMs.current += 250
      const s = st.current
      if (s.phase === 'memo') {
        if (!memoStarted.current || s.frozen) return
        const next = s.memoMs + 250
        setMemoMs(next)
        setProgress(next / MEMO_MS)
        if (next >= MEMO_MS) {
          setFrozen(true)
          setHint(null)
          lineEl.current?.blur()
          titleEl.current?.blur()
          persist()
        }
      } else {
        stepMs.current += 250
        const limit = phaseMs(s.phase)
        setProgress(stepMs.current / limit)
        if (stepMs.current >= limit) setEnded(true)
      }
    }, 250)
    const onVis = () => {
      if (document.visibilityState !== 'visible') persist()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // ---- 共通 ----
  const allMemos = (): Memo[] => {
    const s = st.current
    const curLines = [...s.lines, ...(s.line.trim() ? [s.line] : [])]
    const cur = s.title.trim() || curLines.length ? [{ title: s.title, lines: curLines }] : []
    return s.phase === 'memo' ? [...s.memos, ...cur] : s.memos
  }
  const complete = () => draftComplete(allMemos())

  const finish = (early: boolean) => {
    if (finished.current) return
    finished.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    void saveNoteDraft(buildDraft()) // ヘッダ終了の取り消しに備えて残す(確定時にapp側で消す)
    const s = st.current
    props.onFinish({
      memos: allMemos(),
      issue: s.issue,
      issueFromMemo: s.issueFromMemo,
      conditions: s.cond,
      sky: s.sky,
      rain: s.rain,
      umbrella: s.umbrella,
      links: s.links,
      issueFrom: props.issueFrom,
      durationSec: Math.round(visibleMs.current / 1000),
      early,
    })
  }

  const goto = (p: Phase) => {
    st.current.phase = p
    setPhase(p)
    stepMs.current = 0
    setProgress(0)
    setEnded(false)
    setHint(null)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    persist()
  }
  const nextPhase = () => {
    const i = phases.indexOf(phase)
    if (i >= phases.length - 1) finish(false)
    else goto(phases[i + 1])
  }

  const headerAction = () => {
    if (complete()) finish(true)
    else {
      persist()
      props.onPause()
    }
  }

  // ---- メモ ----
  const startMemoClock = () => {
    if (!memoStarted.current) {
      memoStarted.current = true
      setHint({ text: COPY.memoStartHint, why: COPY.memoStartHintWhy })
    }
  }
  const commitLine = () => {
    const s = st.current
    if (s.frozen) return
    if (!s.line.trim()) return
    if (s.lines.length >= MAX_LINES - 1) {
      setLines([...s.lines, s.line])
      setLine('')
      setFrozen(true) // 6行で満了
      persist()
      return
    }
    setLines([...s.lines, s.line])
    setLine('')
    schedulePersist()
  }
  const nextMemo = () => {
    const s = st.current
    const m: Memo = { title: s.title, lines: [...s.lines, ...(s.line.trim() ? [s.line] : [])] }
    const nm = [...s.memos, m]
    st.current.memos = nm
    setMemos(nm)
    setTitle('')
    setLines([])
    setLine('')
    setMemoMs(0)
    setProgress(0)
    setFrozen(false)
    memoStarted.current = false
    setBankIdx((i) => (i + 1) % TITLE_BANK.length)
    if (nm.length >= memoTotal) {
      st.current.title = ''
      st.current.lines = []
      st.current.line = ''
      if (phases.length === 1) finish(false)
      else nextPhase()
    } else {
      persist()
    }
  }
  const giveTitle = () => {
    if (st.current.frozen || st.current.title.trim()) return
    setTitle(TITLE_BANK[bankIdx])
    setBankIdx((i) => (i + 1) % TITLE_BANK.length)
    startMemoClock()
    schedulePersist()
    lineEl.current?.focus()
  }
  const useCarry = () => {
    if (!props.issueFrom || st.current.frozen || st.current.title.trim()) return
    setTitle(props.issueFrom)
    startMemoClock()
    schedulePersist()
    lineEl.current?.focus()
  }
  const blockedDelete = () => {
    if (!deleteHintShown.current) {
      deleteHintShown.current = true
      setHint({ text: COPY.memoNoDelete })
    }
  }

  // ---- イシュー ----
  const issueOk = /か[。.!?]?$/.test(issue.trim())
  const pickMemo = (i: number) => {
    setIssueFromMemo(i)
    setPickOther(false)
    if (!issue.trim()) setIssue(memos[i].title)
    schedulePersist()
  }
  const setCondition = (k: keyof IssueConditions, v: boolean) => {
    const nc = { ...st.current.cond, [k]: v }
    setCond(nc)
    if (conditionsAnswered(nc) && conditionsCount(nc) < 2) setHint({ text: COPY.condLowHint })
    schedulePersist()
  }
  const issueCanAdvance = issueOk && (!props.stages.conditions || conditionsAnswered(cond))

  // ---- つなぎ ----
  const setLink = (k: keyof NoteLinks, v: LinkState) => {
    const nl = { ...st.current.links, [k]: v }
    setLinks(nl)
    if (hasGap(nl)) setHint({ text: COPY.gapNote, why: COPY.gapNoteWhy })
    else setHint(null)
    schedulePersist()
  }

  const canAdvance = (() => {
    switch (phase) {
      case 'memo':
        return false
      case 'issue':
        return issueCanAdvance
      case 'sky':
        return sky.trim().length > 0
      case 'rain':
        return rain.trim().length > 0
      case 'umbrella':
        return umbrella.trim().length > 0
      case 'links':
        return linksAnswered(links)
    }
  })()

  const isLast = phases.indexOf(phase) === phases.length - 1
  const label =
    phase === 'memo'
      ? `${COPY.memoLabel} ${memos.length + 1}/${memoTotal}`
      : phase === 'issue'
        ? COPY.issueLabel
        : phase === 'sky'
          ? COPY.skyLabel
          : phase === 'rain'
            ? COPY.rainLabel
            : phase === 'umbrella'
              ? COPY.umbrellaLabel
              : COPY.linkLabel

  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">{label}</span>
        <div class="bar-right">
          <button class="ghost icon" onClick={props.onSettings} aria-label="設定">
            ⚙
          </button>
          <button class="ghost" onClick={headerAction}>
            今日はここまで
          </button>
        </div>
      </header>

      {props.minimal && phase === 'memo' && memos.length === 0 && (
        <Hint text={COPY.oneSentenceDay} why={COPY.oneSentenceDayWhy} />
      )}

      <div class="step-dots" aria-hidden="true">
        {phases.map((p, i) => (
          <span key={p} class={`sdot ${i < phases.indexOf(phase) ? 'done' : p === phase ? 'cur' : ''}`} />
        ))}
      </div>

      {/* ---- メモ ---- */}
      {phase === 'memo' && (
        <>
          {memos.length === 0 && props.issueFrom && !title.trim() && !frozen && (
            <button class="carry-line carry-btn" onClick={useCarry}>
              {COPY.carryLine(props.issueFrom)}
              <span class="carry-use">{COPY.carryUse}</span>
            </button>
          )}
          <div class="memo-sheet">
            <StrictInput
              key={`t${memos.length}`}
              value={title}
              placeholder={COPY.memoTitlePh}
              disabled={frozen}
              autoFocus={!title}
              register={(el) => (titleEl.current = el)}
              onChange={(v) => {
                startMemoClock()
                setTitle(v)
                schedulePersist()
              }}
              onEnter={() => lineEl.current?.focus()}
              onBlockedDelete={blockedDelete}
              onBlockedPaste={() => setHint({ text: COPY.memoPaste })}
            />
            <ol class="memo-lines">
              {lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              {!frozen && lines.length < MAX_LINES && (
                <li class="memo-current">
                  <StrictInput
                    key={`l${memos.length}-${lines.length}`}
                    value={line}
                    placeholder={COPY.memoLinePh(lines.length)}
                    disabled={frozen}
                    register={(el) => (lineEl.current = el)}
                    onChange={(v) => {
                      startMemoClock()
                      setLine(v)
                      schedulePersist()
                    }}
                    onEnter={commitLine}
                    onBlockedDelete={blockedDelete}
                    onBlockedPaste={() => setHint({ text: COPY.memoPaste })}
                  />
                </li>
              )}
            </ol>
          </div>
          <div class="timer-row">
            <TimerRing progress={progress} />
            {!frozen && !title.trim() && (
              <button class="ghost" onClick={giveTitle}>
                {COPY.memoGetTitle}
              </button>
            )}
            {frozen && (
              <>
                <span class="end-line fade-in">{memos.length + 1 >= memoTotal ? COPY.memoFrozenLast : COPY.memoFrozen}</span>
                <button class="primary push-right" disabled={!memoHasBody({ title, lines: [...lines, line] })} onClick={nextMemo}>
                  {memos.length + 1 >= memoTotal ? (phases.length === 1 ? COPY.noteFinish : COPY.memoToIssue) : COPY.memoNext}
                </button>
              </>
            )}
            {!frozen && memoStarted.current && (
              <button class="ghost push-right" onClick={() => setFrozen(true)}>
                {memos.length + 1 >= memoTotal ? COPY.memoToIssue : COPY.memoNext}
              </button>
            )}
          </div>
        </>
      )}

      {/* ---- イシュー ---- */}
      {phase === 'issue' && (
        <>
          <div class="question">{COPY.issuePick}</div>
          <ul class="insight-list">
            {memos.map((m, i) => (
              <li key={i} class={issueFromMemo === i ? 'picked' : ''}>
                <button class="insight-btn" onClick={() => pickMemo(i)}>
                  <span class="s-date">{i + 1}</span>
                  <span class="insight-text">{m.title}</span>
                </button>
              </li>
            ))}
            <li class={pickOther ? 'picked' : ''}>
              <button
                class="insight-btn other"
                onClick={() => {
                  setIssueFromMemo(null)
                  setPickOther(true)
                  schedulePersist()
                }}
              >
                <span class="insight-text">{COPY.issueOther}</span>
              </button>
            </li>
          </ul>
          {(issueFromMemo !== null || pickOther) && (
            <>
              {issueFromMemo !== null && (
                <ul class="memo-preview">
                  {memos[issueFromMemo].lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
              <div class="question">{COPY.issueAsk}</div>
              <PlainEditor
                key={`issue-${issueFromMemo ?? 'x'}`}
                initial={issue}
                placeholder={COPY.issuePh}
                autoFocus
                onChange={(v) => {
                  setIssue(v)
                  schedulePersist()
                }}
              />
              {issue.trim() && !issueOk && <InlineHint text={COPY.issueEndHint} why={COPY.issueEndHintWhy} />}
              {props.stages.conditions && issueOk && (
                <div class="cond-list">
                  <div class="tag-ask">{COPY.condAsk}</div>
                  {(
                    [
                      ['pivotal', COPY.condPivotal],
                      ['deep', COPY.condDeep],
                      ['answerable', COPY.condAnswerable],
                    ] as [keyof IssueConditions, string][]
                  ).map(([k, text]) => (
                    <div key={k} class="cond-row">
                      <span class="cond-text">{text}</span>
                      <button class={`chip ${cond[k] === true ? 'on' : ''}`} onClick={() => setCondition(k, true)}>
                        {COPY.condYes}
                      </button>
                      <button class={`chip ${cond[k] === false ? 'on' : ''}`} onClick={() => setCondition(k, false)}>
                        {COPY.condNo}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ---- 空・雨・傘 ---- */}
      {(phase === 'sky' || phase === 'rain' || phase === 'umbrella') && (
        <>
          <div class="anchor">
            <span class="anchor-k">{COPY.issueLabel}</span>
            <span class="anchor-text">{issue}</span>
          </div>
          {phase === 'rain' && sky && (
            <div class="anchor soft">
              <span class="anchor-k">{COPY.skyLabel}</span>
              <span class="anchor-text">{sky}</span>
            </div>
          )}
          {phase === 'umbrella' && rain && (
            <div class="anchor soft">
              <span class="anchor-k">{COPY.rainLabel}</span>
              <span class="anchor-text">{rain}</span>
            </div>
          )}
          <div class="question">{phase === 'sky' ? COPY.skyQ : phase === 'rain' ? COPY.rainQ : COPY.umbrellaQ}</div>
          <PlainEditor
            key={phase}
            initial={phase === 'sky' ? sky : phase === 'rain' ? rain : umbrella}
            placeholder={phase === 'sky' ? COPY.skyPh : phase === 'rain' ? COPY.rainPh : COPY.umbrellaPh}
            autoFocus
            onChange={(v) => {
              if (phase === 'sky') setSky(v)
              else if (phase === 'rain') setRain(v)
              else setUmbrella(v)
              schedulePersist()
            }}
          />
        </>
      )}

      {/* ---- つなぎ ---- */}
      {phase === 'links' && (
        <>
          <div class="question">{COPY.linkQ}</div>
          <div class="link-list">
            {(
              [
                ['sr', COPY.skyLabel, sky, COPY.rainLabel, rain, COPY.linkSR],
                ['ru', COPY.rainLabel, rain, COPY.umbrellaLabel, umbrella, COPY.linkRU],
              ] as [keyof NoteLinks, string, string, string, string, string][]
            ).map(([k, la, ta, lb, tb, test]) => (
              <div key={k} class="link-pair">
                <div class="link-texts">
                  <p>
                    <span class="anchor-k">{la}</span>
                    {ta}
                  </p>
                  <p>
                    <span class="anchor-k">{lb}</span>
                    {tb}
                  </p>
                </div>
                <div class="link-test">{test}</div>
                <div class="tag-row">
                  <button class={`chip ${links[k] === 'ok' ? 'on' : ''}`} onClick={() => setLink(k, 'ok')}>
                    {COPY.linkOk}
                  </button>
                  <button class={`chip ${links[k] === 'gap' ? 'on gap' : ''}`} onClick={() => setLink(k, 'gap')}>
                    {COPY.linkGap}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {phase !== 'memo' && (
        <div class="timer-row">
          <TimerRing progress={progress} />
          {ended && <span class="end-line fade-in">{COPY.timerEnd}</span>}
          <button class="primary push-right" disabled={!canAdvance} onClick={nextPhase}>
            {isLast ? COPY.noteFinish : COPY.noteNext}
          </button>
        </div>
      )}

      {hint && <Hint text={hint.text} why={hint.why} />}
    </div>
  )
}
