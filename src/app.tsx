import { useEffect, useRef, useState } from 'preact/hooks'
import { Onboarding } from './screens/Onboarding'
import { Restart } from './screens/Restart'
import { SessionNote, type SessionNoteResult } from './screens/SessionNote'
import { Review } from './screens/Review'
import { Done } from './screens/Done'
import { Checkpoint } from './screens/Checkpoint'
import { SettingsScreen } from './screens/Settings'
import { COPY } from './lib/copy'
import { initClock, missedRequiredDays, monthStr, todayStr } from './lib/clock'
import { dbGetAll } from './lib/db'
import {
  arrivedCapsule,
  arrivedMemoBag,
  clearNoteDraft,
  commitNote,
  gapStats,
  getCheckpoint,
  issueStats,
  listCheckpoints,
  loadNoteDraft,
  loadSettings,
  notesThisWeek,
  openCapsule,
  saveCheckpoint,
  saveSettings,
  setBagState,
  setCapsuleState,
  settleLegacyDrafts,
  settleStaleNoteDraft,
  type CapsuleWeek,
  type MemoBagWeek,
} from './lib/store'
import { countWeekCompletions, planToday, recordCompletion, stageUnlocked, weekDots } from './lib/schedule'
import type { CoachCard } from './data/coachCards'
import type { CheckpointRecord, DayRecord, Note, NoteDraft, Settings } from './lib/types'

type View =
  | { v: 'loading' }
  | { v: 'onboarding' }
  | { v: 'restart' }
  | { v: 'note'; minimal: boolean; issueFrom: string | null; draft: NoteDraft | null }
  | { v: 'done'; justCompleted: boolean; newCard: CoachCard | null; weekCount: number; closeTalkEligible: boolean }
  | { v: 'paused' }
  | { v: 'review' }
  | { v: 'checkpoint' }
  | { v: 'settings' }

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [view, setView] = useState<View>({ v: 'loading' })
  const [dots, setDots] = useState<boolean[]>([])
  const [weekNotes, setWeekNotes] = useState<Note[]>([])
  const [capsule, setCapsule] = useState<CapsuleWeek | null>(null)
  const [bag, setBag] = useState<MemoBagWeek | null>(null)
  const [toast, setToast] = useState(false)
  const [backupNudgeText, setBackupNudgeText] = useState<string | null>(null)
  const [ckHistory, setCkHistory] = useState<CheckpointRecord[]>([])
  const [ckPrevTalk, setCkPrevTalk] = useState<number | null>(null)
  const [ckIssues, setCkIssues] = useState<Record<string, { f: number; n: number }>>({})
  const [ckGaps, setCkGaps] = useState<Record<string, { g: number; n: number }>>({})
  const [ckResume, setCkResume] = useState<{ audio?: ArrayBuffer; mimeType?: string } | null>(null)

  const prevView = useRef<View>({ v: 'loading' })
  const reviewResult = useRef<{ newCard: CoachCard | null; weekCount: number } | null>(null)
  const ckResult = useRef<{ newCard: CoachCard | null; weekCount: number } | null>(null)
  const finalizing = useRef(false)
  const undoTimer = useRef<number | null>(null)
  const lastMinimal = useRef(false)
  const settingsRef = useRef<Settings | null>(null)

  const updateSettings = async (s: Settings) => {
    settingsRef.current = s
    setSettings(s)
    await saveSettings(s)
  }

  // ---- 起動 ----
  const [fatal, setFatal] = useState(false)
  useEffect(() => {
    void (async () => {
      try {
        await initClock()
        let s = await loadSettings()
        await settleLegacyDrafts()
        s = await settleStaleNoteDraft(s)
        settingsRef.current = s
        setSettings(s)
        if (navigator.storage?.persist) void navigator.storage.persist()
        if (!s.onboarded) setView({ v: 'onboarding' })
        else await route(s)
      } catch {
        // 旧バージョンのJS×新DB等でDBが開けない場合、無言の空画面にしない
        setFatal(true)
      }
    })()
  }, [])

  // ---- 前面表示中のみの通知(§11.3 副経路) ----
  useEffect(() => {
    const iv = window.setInterval(() => {
      const s = settingsRef.current
      if (!s || !s.onboarded || document.visibilityState !== 'visible') return
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const now = new Date()
      const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      if (cur !== s.notifyTime || s.notifiedOn === todayStr()) return
      const missed = s.lastSessionDate ? missedRequiredDays(s.lastSessionDate, todayStr()) : 0
      if (missed >= 3) return // 3日以上欠落 → 通知を止める(§6)
      const body = missed >= 1 ? COPY.oneSentenceDay : COPY.notifyBody(s.ifThenText)
      new Notification('水路', { body })
      void updateSettings({ ...s, notifiedOn: todayStr() })
    }, 20000)
    return () => clearInterval(iv)
  }, [])

  // ---- ルーティング(§3: 今日はこれ一つ) ----
  const route = async (s: Settings) => {
    const days = await dbGetAll<DayRecord>('days')
    const notes = await notesThisWeek()
    const plan = planToday(s, days, notes.length)
    if (plan.kind === 'restart') {
      setView({ v: 'restart' })
    } else if (plan.kind === 'completed') {
      // 定点観測の3指標が未入力のままプロセス破棄された月は、指標入力から再開する
      const todayRec = days.find((d) => d.date === todayStr())
      if (todayRec?.mode === 'checkpoint') {
        const rec = await getCheckpoint(monthStr())
        if (rec && rec.wordCount === null && rec.fillerCount === null && rec.silenceCount === null) {
          await startCheckpoint(s, { audio: rec.audio, mimeType: rec.mimeType })
          return
        }
      }
      await enterDone(false, null, undefined, false)
    } else if (plan.kind === 'checkpoint') {
      await startCheckpoint(s)
    } else if (plan.kind === 'review') {
      setWeekNotes(notes)
      setCapsule(await arrivedCapsule())
      setBag(await arrivedMemoBag())
      setView({ v: 'review' })
    } else {
      await startNote(s, plan.minimal)
    }
  }

  const startNote = async (s: Settings, minimal: boolean) => {
    const today = todayStr()
    const draft = await loadNoteDraft()
    const sameDay = draft && draft.date === today && Array.isArray(draft.memos) ? draft : null
    lastMinimal.current = minimal
    setView({
      v: 'note',
      minimal,
      issueFrom: sameDay ? sameDay.issueFrom : s.carryHypothesis,
      draft: sameDay,
    })
  }

  const startCheckpoint = async (s: Settings, resume: { audio?: ArrayBuffer; mimeType?: string } | null = null) => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    const pm = monthStr(d)
    const prev =
      s.closeTalk.month === pm ? s.closeTalk.count : s.closeTalkPrev.month === pm ? s.closeTalkPrev.count : 0
    setCkPrevTalk(prev)
    setCkHistory((await listCheckpoints()).filter((c) => c.month !== monthStr()))
    setCkIssues(await issueStats())
    setCkGaps(await gapStats())
    setCkResume(resume)
    setView({ v: 'checkpoint' })
  }

  const enterDone = async (
    justCompleted: boolean,
    newCard: CoachCard | null,
    weekCount: number | undefined,
    closeTalkEligible: boolean
  ) => {
    setDots(await weekDots())
    const wc = weekCount ?? (await countWeekCompletions())
    const s = settingsRef.current
    // バックアップ促しは月1回まで(§9.3)
    let nudge: string | null = null
    if (s && s.backupNudgeMonth !== monthStr()) {
      if (s.lastBackupAt === null && s.completedSessions >= 5) nudge = COPY.backupNudge(null)
      else if (s.lastBackupAt !== null) {
        const d = Math.floor((Date.now() - s.lastBackupAt) / 86400000)
        if (d >= 30) nudge = COPY.backupNudge(d)
      }
      if (nudge) await updateSettings({ ...s, backupNudgeMonth: monthStr() })
    }
    setBackupNudgeText(nudge)
    setView({ v: 'done', justCompleted, newCard, weekCount: wc, closeTalkEligible })
  }

  // ---- 五つの段の完了 ----
  const finishNote = async (r: SessionNoteResult) => {
    if (finalizing.current) return // 連打の二重計上防止
    finalizing.current = true
    try {
      const s = settingsRef.current!
      await commitNote(todayStr(), r)
      const res = await recordCompletion(s, 'note', r.issue.trim() || null)
      await updateSettings(res.settings)
      if (r.early) {
        // ヘッダ「今日はここまで」の誤タップ保険: 5秒だけ「続きを書く」(§2.2と同じ非ブロッキングUndo)
        setToast(true)
        if (undoTimer.current) clearTimeout(undoTimer.current)
        undoTimer.current = window.setTimeout(() => {
          setToast(false)
          void clearNoteDraft()
        }, 5000)
      } else {
        await clearNoteDraft()
      }
      await enterDone(true, res.newCard, res.weekCount, true)
    } finally {
      finalizing.current = false
    }
  }

  const undoEarlyFinish = async () => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setToast(false)
    // 完了記録は残したまま、下書きから同じ段に戻る(再度終えれば同日のノートを上書き)
    await startNote(settingsRef.current!, lastMinimal.current)
  }

  // ---- 日曜・定点観測 ----
  const reviewPick = async () => {
    const s = settingsRef.current!
    const res = await recordCompletion(s, 'review', s.carryHypothesis)
    await updateSettings(res.settings)
    reviewResult.current = { newCard: res.newCard, weekCount: res.weekCount }
  }

  const reviewExit = async () => {
    const r = reviewResult.current
    if (r) await enterDone(true, r.newCard, r.weekCount, false)
    else setView({ v: 'paused' })
  }

  const ckRecorded = async (audio: ArrayBuffer | null, mimeType: string | null) => {
    const s = settingsRef.current!
    const res = await recordCompletion(s, 'checkpoint', s.carryHypothesis)
    await updateSettings(res.settings)
    ckResult.current = { newCard: res.newCard, weekCount: res.weekCount }
    const base = {
      month: monthStr(),
      createdAt: Date.now(),
      wordCount: null,
      fillerCount: null,
      silenceCount: null,
      closeTalkPrevCount: ckPrevTalk,
    }
    try {
      await saveCheckpoint({ ...base, audio: audio ?? undefined, mimeType: mimeType ?? undefined })
    } catch {
      await saveCheckpoint(base).catch(() => undefined)
    }
  }

  const ckSaveMetrics = async (m: {
    wordCount: number | null
    fillerCount: number | null
    silenceCount: number | null
  }) => {
    const rec = await getCheckpoint(monthStr())
    await saveCheckpoint({
      ...(rec ?? {
        month: monthStr(),
        createdAt: Date.now(),
        wordCount: null,
        fillerCount: null,
        silenceCount: null,
        closeTalkPrevCount: ckPrevTalk,
      }),
      ...m,
    })
  }

  const ckExit = async () => {
    const r = ckResult.current
    await enterDone(true, r?.newCard ?? null, r?.weekCount, false)
  }

  // ---- 完了画面の操作 ----
  const closeTalk = async () => {
    const s = settingsRef.current!
    const m = monthStr()
    if (s.closeTalk.month === m) {
      await updateSettings({ ...s, closeTalk: { month: m, count: s.closeTalk.count + 1 } })
    } else {
      await updateSettings({
        ...s,
        closeTalkPrev: s.closeTalk.month ? s.closeTalk : s.closeTalkPrev,
        closeTalk: { month: m, count: 1 },
      })
    }
  }

  const restartGo = async () => {
    const s = settingsRef.current!
    const ns = { ...s, lastSessionDate: null, carryHypothesis: null }
    await updateSettings(ns)
    await startNote(ns, false)
  }

  const onboardDone = async (ifThen: string, time: string) => {
    const s = settingsRef.current!
    const ns = { ...s, onboarded: true, ifThenText: ifThen, notifyTime: time }
    await updateSettings(ns)
    await route(ns)
  }

  const openSettings = () => {
    prevView.current = view
    setView({ v: 'settings' })
  }
  const closeSettings = async () => {
    const pv = prevView.current
    if (pv.v === 'note') {
      // セッション途中の設定往復: 最新の下書きから復元する
      await startNote(settingsRef.current!, pv.minimal)
    } else if (pv.v === 'review') {
      setView(pv)
    } else {
      await route(settingsRef.current!)
    }
  }

  if (fatal) {
    return (
      <div class="screen center">
        <p class="note">
          データを開けなかった。他のタブ/ウィンドウの水路を閉じて、
          <button class="ghost" onClick={() => location.reload()}>
            再読み込み
          </button>
        </p>
      </div>
    )
  }

  if (!settings || view.v === 'loading') {
    return <div class="screen center" />
  }

  return (
    <>
      {view.v === 'onboarding' && <Onboarding onDone={(a, b) => void onboardDone(a, b)} />}
      {view.v === 'restart' && <Restart onGo={() => void restartGo()} />}
      {view.v === 'note' && (
        <SessionNote
          settings={settings}
          minimal={view.minimal}
          issueFrom={view.issueFrom}
          draft={view.draft}
          stages={{ issue: stageUnlocked(settings, 2), sky: stageUnlocked(settings, 3), conditions: stageUnlocked(settings, 4) }}
          onFinish={(r) => void finishNote(r)}
          onPause={() => setView({ v: 'paused' })}
          onSettings={openSettings}
        />
      )}
      {view.v === 'done' && (
        <Done
          settings={settings}
          dots={dots}
          justCompleted={view.justCompleted}
          newCard={view.newCard}
          weekCount={view.weekCount}
          showCloseTalk={view.closeTalkEligible && stageUnlocked(settings, 5)}
          showReminderGuide={view.justCompleted && !settings.reminderGuideShown}
          backupNudge={backupNudgeText}
          onCloseTalk={() => void closeTalk()}
          onDismissReminderGuide={() => void updateSettings({ ...settingsRef.current!, reminderGuideShown: true })}
          onSettings={openSettings}
        />
      )}
      {view.v === 'paused' && (
        <div class="screen center">
          <button class="ghost" onClick={() => void route(settingsRef.current!)}>
            続きを書く
          </button>
        </div>
      )}
      {view.v === 'review' && (
        <Review
          notes={weekNotes}
          capsule={capsule}
          bag={bag}
          onPick={() => reviewPick()}
          onBagState={(b, st) => setBagState(b, st)}
          onTalked={() => void closeTalk()}
          onOpenCapsule={async (c) => {
            const o = await openCapsule(c)
            await setCapsuleState(c, 'opened')
            return o
          }}
          onDiscardCapsule={(c) => setCapsuleState(c, 'discarded')}
          onDone={() => void reviewExit()}
          onSettings={openSettings}
        />
      )}
      {view.v === 'checkpoint' && (
        <Checkpoint
          history={ckHistory}
          prevTalkCount={ckPrevTalk}
          issues={ckIssues}
          gaps={ckGaps}
          thisMonth={monthStr()}
          resume={ckResume}
          onRecorded={ckRecorded}
          onSaveMetrics={ckSaveMetrics}
          onExit={() => void ckExit()}
        />
      )}
      {view.v === 'settings' && (
        <SettingsScreen settings={settings} onChange={(s) => void updateSettings(s)} onBack={() => void closeSettings()} />
      )}
      {toast && (
        <button class="undo-toast fade-in" onClick={() => void undoEarlyFinish()}>
          {COPY.undoToast}
        </button>
      )}
    </>
  )
}
