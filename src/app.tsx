import { useEffect, useRef, useState } from 'preact/hooks'
import { Onboarding } from './screens/Onboarding'
import { Restart } from './screens/Restart'
import { SessionA, type SessionAResult } from './screens/SessionA'
import { SessionB } from './screens/SessionB'
import { SessionC } from './screens/SessionC'
import { Done } from './screens/Done'
import { Reread } from './screens/Reread'
import { Revise } from './screens/Revise'
import { SettingsScreen } from './screens/Settings'
import { COPY } from './lib/copy'
import { initClock, missedRequiredDays, monthStr, todayStr } from './lib/clock'
import { dbGet, dbGetAll } from './lib/db'
import { meetsCompletion } from './lib/metrics'
import {
  addEssaySentence,
  carryHistoryThisWeek,
  clearBonusDraft,
  clearDraft,
  commitDiary,
  getCurrentEssay,
  latestPastEssay,
  loadBonusDraft,
  loadDraft,
  loadSettings,
  putEssay,
  recordEmotion,
  reviseTarget,
  recentCarryQuestions,
  saveDraft,
  saveSettings,
  settleBonusDraft,
  settleStaleDraft,
} from './lib/store'
import { pickQuestion, themeCandidates } from './lib/questions'
import { countWeekCompletions, planToday, recordCompletion, stageUnlocked, weekDots } from './lib/schedule'
import type { CoachCard } from './data/coachCards'
import type { DayRecord, Essay, Settings } from './lib/types'

type View =
  | { v: 'loading' }
  | { v: 'onboarding' }
  | { v: 'restart' }
  | {
      v: 'A'
      minimal: boolean
      bonus: boolean
      question: string
      initialText: string
      initialEmotion: string
      initialVisibleMs: number
      initialPauses: number
    }
  | { v: 'B' }
  | { v: 'C' }
  | { v: 'done'; justCompleted: boolean; newCard: CoachCard | null; weekCount: number; closeTalkEligible: boolean }
  | { v: 'paused' }
  | { v: 'reread' }
  | { v: 'revise' }
  | { v: 'settings' }

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [view, setView] = useState<View>({ v: 'loading' })
  const [dots, setDots] = useState<boolean[]>([])
  const [essayCur, setEssayCur] = useState<Essay | null>(null)
  const [essayLast, setEssayLast] = useState<Essay | null>(null)
  const [candidates, setCandidates] = useState<string[]>([])
  const [carryList, setCarryList] = useState<string[]>([])
  const [toast, setToast] = useState(false)
  const [backupNudgeText, setBackupNudgeText] = useState<string | null>(null)

  const pending = useRef<{ timer: number; data: SessionAResult } | null>(null)
  const lastQuestion = useRef('')
  const prevView = useRef<View>({ v: 'loading' })
  const reviseResult = useRef<{ newCard: CoachCard | null; weekCount: number } | null>(null)
  const finalizing = useRef(false)
  const settingsRef = useRef<Settings | null>(null)

  const updateSettings = async (s: Settings) => {
    settingsRef.current = s
    setSettings(s)
    await saveSettings(s)
  }

  // ---- 5秒遅延コミット(非ブロッキングUndo §2.2) ----
  const flushPending = async () => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    setToast(false)
    await commitDiary(todayStr(), p.data.text, p.data.emotion || null, p.data.metrics)
    await clearDraft()
    // 画面B/Cで離脱した日も完了として救済(§7.1: 完了条件は排水時点で満たしている)
    if (meetsCompletion(p.data.text)) {
      const s = settingsRef.current
      const existing = await dbGet<DayRecord>('days', todayStr())
      if (s && !existing) {
        const consumed = s.carryQuestion === lastQuestion.current ? null : s.carryQuestion
        const res = await recordCompletion(s, 'drain', consumed)
        await updateSettings(res.settings)
      }
    }
  }
  const startPending = (data: SessionAResult) => {
    void flushPending()
    const timer = window.setTimeout(() => void flushPending(), 5000)
    pending.current = { timer, data }
    setToast(true)
  }
  const undoPending = () => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    setToast(false)
    // 完了記録が済んだ後に戻った場合は「書き足し」として続きを書く
    const bonus = view.v === 'done'
    setView({
      v: 'A',
      minimal: false,
      bonus,
      question: lastQuestion.current,
      initialText: p.data.text,
      initialEmotion: p.data.emotion,
      initialVisibleMs: p.data.metrics.durationSec * 1000,
      initialPauses: p.data.metrics.pauses,
    })
  }

  useEffect(() => {
    const onVis = () => {
      // バックグラウンド移行時は猶予を待たず確定(§2.2)
      if (document.visibilityState === 'hidden') void flushPending()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ---- 起動 ----
  useEffect(() => {
    void (async () => {
      await initClock()
      let s = await loadSettings()
      s = await settleStaleDraft(s)
      await settleBonusDraft()
      settingsRef.current = s
      setSettings(s)
      if (navigator.storage?.persist) void navigator.storage.persist()
      if (!s.onboarded) setView({ v: 'onboarding' })
      else await route(s)
    })()
  }, [])

  // ---- 前面表示中のみの通知(§11.3 副経路、§6の適応型文言) ----
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
    const target = await reviseTarget()
    const days = await dbGetAll<DayRecord>('days')
    const plan = planToday(s, target, days)
    if (plan.kind === 'restart') {
      setView({ v: 'restart' })
    } else if (plan.kind === 'completed') {
      await enterDone(false, null, undefined, false)
    } else if (plan.kind === 'reread') {
      setEssayCur(await getCurrentEssay())
      setCarryList(await carryHistoryThisWeek())
      setView({ v: 'reread' })
    } else if (plan.kind === 'revise' && target) {
      setEssayCur(target)
      setView({ v: 'revise' })
    } else {
      await startDrain(s, plan.kind === 'drain' ? plan.minimal : false)
    }
  }

  const startDrain = async (s: Settings, minimal: boolean) => {
    const today = todayStr()
    const draft = await loadDraft()
    const sameDay = draft && draft.date === today ? draft : null
    let question: string
    if (sameDay?.question) {
      question = sameDay.question
    } else if (s.carryQuestion) {
      question = s.carryQuestion
    } else {
      const r = pickQuestion(s, 'starter')
      question = r.question
      await updateSettings({ ...s, usedQuestionIds: r.usedQuestionIds })
    }
    lastQuestion.current = question
    await saveDraft({
      date: today,
      question,
      text: sameDay?.text ?? '',
      emotionWord: sameDay?.emotionWord ?? '',
      pauses: sameDay?.pauses ?? 0,
      visibleMs: sameDay?.visibleMs ?? 0,
    })
    setView({
      v: 'A',
      minimal,
      bonus: false,
      question,
      initialText: sameDay?.text ?? '',
      initialEmotion: sameDay?.emotionWord ?? '',
      initialVisibleMs: sameDay?.visibleMs ?? 0,
      initialPauses: sameDay?.pauses ?? 0,
    })
  }

  const enterDone = async (
    justCompleted: boolean,
    newCard: CoachCard | null,
    weekCount: number | undefined,
    closeTalkEligible: boolean
  ) => {
    setDots(await weekDots())
    const wc = weekCount ?? (await countWeekCompletions())
    // バックアップ促しは月1回まで(§9.3)
    const s = settingsRef.current
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

  // ---- セッションの流れ ----
  const finishA = async (r: SessionAResult) => {
    const s = settingsRef.current!
    if (r.emotion.trim()) await recordEmotion(r.emotion)
    const cur = view
    if (cur.v === 'A' && cur.bonus) {
      // 書き足し: 日記コミットのみ。判定・表示には影響しない(§2.1)
      await commitDiary(todayStr(), r.text, r.emotion || null, r.metrics)
      await clearBonusDraft()
      await clearDraft() // Undo経由で残った本編のdraftも確定済みなので消す(二重コミット防止)
      await enterDone(false, null, undefined, false)
      return
    }
    startPending(r)
    if (cur.v === 'A' && cur.minimal) {
      // 1文だけでいい日: B・C自動スキップ(§2.1)
      await finalize(null)
      return
    }
    if (stageUnlocked(s, 3)) {
      setEssayCur(await getCurrentEssay())
      const last = await latestPastEssay()
      setEssayLast(last)
      setCandidates(themeCandidates(s, await recentCarryQuestions()))
      setView({ v: 'B' })
    } else {
      setView({ v: 'C' })
    }
  }

  const doneB = async (theme: string, recipient: string, sentence: string) => {
    await addEssaySentence(theme, recipient, sentence)
    setView({ v: 'C' })
  }

  const finalize = async (carry: string | null, mode: 'drain' | 'reread' | 'revise' = 'drain') => {
    if (finalizing.current) return // 完了ボタン連打の二重計上防止
    finalizing.current = true
    try {
      const s = settingsRef.current!
      const res = await recordCompletion(s, mode, carry)
      await updateSettings(res.settings)
      await enterDone(true, res.newCard, res.weekCount, mode === 'drain')
    } finally {
      finalizing.current = false
    }
  }

  // ---- 再読・推敲 ----
  const doneReread = async () => {
    const s = settingsRef.current!
    await finalize(s.carryQuestion, 'reread')
  }

  const reviseReadDone = async () => {
    const s = settingsRef.current!
    const res = await recordCompletion(s, 'revise', s.carryQuestion)
    await updateSettings(res.settings)
    reviseResult.current = { newCard: res.newCard, weekCount: res.weekCount }
  }

  const reviseExit = async () => {
    const r = reviseResult.current
    await enterDone(true, r?.newCard ?? null, r?.weekCount, false)
  }

  const updateSentence = async (idx: number, text: string) => {
    if (!essayCur) return
    const ns = { ...essayCur, sentences: essayCur.sentences.map((s, i) => (i === idx ? { ...s, text } : s)) }
    await putEssay(ns)
    setEssayCur(ns)
  }

  const archive = async (reply: string) => {
    if (!essayCur) return
    const ns: Essay = { ...essayCur, archivedAt: Date.now(), replyImagined: reply || undefined }
    await putEssay(ns)
    setEssayCur(ns)
    await reviseExit()
  }

  // ---- 完了画面の操作 ----
  const closeTalk = async () => {
    const s = settingsRef.current!
    const m = monthStr()
    const ct = s.closeTalk.month === m ? { month: m, count: s.closeTalk.count + 1 } : { month: m, count: 1 }
    await updateSettings({ ...s, closeTalk: ct })
  }

  const bonus = async () => {
    const s = settingsRef.current!
    const r = pickQuestion(s, 'starter')
    await updateSettings({ ...s, usedQuestionIds: r.usedQuestionIds })
    lastQuestion.current = r.question
    setView({
      v: 'A',
      minimal: false,
      bonus: true,
      question: r.question,
      initialText: '',
      initialEmotion: '',
      initialVisibleMs: 0,
      initialPauses: 0,
    })
  }

  const restartGo = async () => {
    const s = settingsRef.current!
    // 空白日数には言及しない。文言だけがフレッシュスタートを演出する(§7.4)
    const ns = { ...s, lastSessionDate: null }
    await updateSettings(ns)
    await startDrain(ns, false)
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
    if (pv.v === 'A') {
      // セッション途中の設定往復: 最新の下書きから本文・時間・回数を復元する
      if (pv.bonus) {
        const bd = await loadBonusDraft()
        setView({ ...pv, initialText: bd?.text ?? pv.initialText, initialEmotion: bd?.emotionWord ?? pv.initialEmotion })
      } else {
        const d = await loadDraft()
        setView({
          ...pv,
          initialText: d?.text ?? pv.initialText,
          initialEmotion: d?.emotionWord ?? pv.initialEmotion,
          initialVisibleMs: d?.visibleMs ?? pv.initialVisibleMs,
          initialPauses: d?.pauses ?? pv.initialPauses,
        })
      }
    } else if (pv.v === 'B' || pv.v === 'C') {
      setView(pv)
    } else {
      await route(settingsRef.current!)
    }
  }

  if (!settings || view.v === 'loading') {
    return <div class="screen center" />
  }

  return (
    <>
      {view.v === 'onboarding' && <Onboarding onDone={(a, b) => void onboardDone(a, b)} />}
      {view.v === 'restart' && <Restart onGo={() => void restartGo()} />}
      {view.v === 'A' && (
        <SessionA
          key={view.bonus ? 'bonus' : 'main'}
          settings={settings}
          minimal={view.minimal}
          bonus={view.bonus}
          question={view.question}
          initialText={view.initialText}
          initialEmotion={view.initialEmotion}
          initialVisibleMs={view.initialVisibleMs}
          initialPauses={view.initialPauses}
          showEmotion={stageUnlocked(settings, 2) && !view.minimal && !view.bonus}
          onFinish={(r) => void finishA(r)}
          onPause={() => setView({ v: 'paused' })}
          onBackspaceHintShown={() => void updateSettings({ ...settingsRef.current!, backspaceHintShown: true })}
          onSettings={openSettings}
        />
      )}
      {view.v === 'B' && (
        <SessionB current={essayCur} last={essayLast} candidates={candidates} onDone={(t, rc, sn) => void doneB(t, rc, sn)} />
      )}
      {view.v === 'C' && <SessionC onDone={(c) => void finalize(c)} />}
      {view.v === 'done' && (
        <Done
          settings={settings}
          dots={dots}
          justCompleted={view.justCompleted}
          newCard={view.newCard}
          weekCount={view.weekCount}
          showCloseTalk={view.closeTalkEligible && stageUnlocked(settings, 6)}
          showReminderGuide={view.justCompleted && !settings.reminderGuideShown}
          backupNudge={backupNudgeText}
          onCloseTalk={() => void closeTalk()}
          onDismissReminderGuide={() => void updateSettings({ ...settingsRef.current!, reminderGuideShown: true })}
          onBonus={() => void bonus()}
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
      {view.v === 'reread' && (
        <Reread essay={essayCur} carryHistory={carryList} onDone={() => void doneReread()} onSettings={openSettings} />
      )}
      {view.v === 'revise' && essayCur && (
        <Revise
          essay={essayCur}
          onReadDone={() => void reviseReadDone()}
          onUpdateSentence={(i, t) => void updateSentence(i, t)}
          onArchive={(r) => void archive(r)}
          onExit={() => void reviseExit()}
        />
      )}
      {view.v === 'settings' && (
        <SettingsScreen settings={settings} onChange={(s) => void updateSettings(s)} onBack={() => void closeSettings()} />
      )}
      {toast && (
        <button class="undo-toast fade-in" onClick={undoPending}>
          {COPY.undoToast}
        </button>
      )}
    </>
  )
}
