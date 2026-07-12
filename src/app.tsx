import { useEffect, useRef, useState } from 'preact/hooks'
import { Onboarding } from './screens/Onboarding'
import { Restart } from './screens/Restart'
import { SessionA, type SessionAResult } from './screens/SessionA'
import { SessionDig, type SessionDigResult } from './screens/SessionDig'
import { SessionB } from './screens/SessionB'
import { SessionC } from './screens/SessionC'
import { Done } from './screens/Done'
import { Reread } from './screens/Reread'
import { Revise } from './screens/Revise'
import { Checkpoint } from './screens/Checkpoint'
import { SettingsScreen } from './screens/Settings'
import { COPY } from './lib/copy'
import { initClock, missedRequiredDays, monthStr, todayStr } from './lib/clock'
import { dbGet, dbGetAll } from './lib/db'
import { meetsCompletion } from './lib/metrics'
import {
  addEssaySentence,
  addInbox,
  arrivedCapsule,
  carryHistoryThisWeek,
  checkRumination,
  clearBonusDraft,
  clearDraft,
  commitDiary,
  deleteInbox,
  getCheckpoint,
  getCurrentEssay,
  latestPastEssay,
  listCheckpoints,
  loadBonusDraft,
  loadDraft,
  loadSettings,
  oldestInbox,
  openCapsule,
  putEssay,
  recordEmotion,
  recentCarryQuestions,
  reviseTarget,
  saveCheckpoint,
  saveDraft,
  saveSettings,
  setCapsuleState,
  settleBonusDraft,
  settleStaleDraft,
  surfacePhrase,
  sweepInbox,
  type CapsuleWeek,
} from './lib/store'
import { DIG_QUESTIONS, pickQuestion, themeCandidates } from './lib/questions'
import { countWeekCompletions, planToday, recordCompletion, stageUnlocked, weekDots } from './lib/schedule'
import type { CoachCard } from './data/coachCards'
import type { CheckpointRecord, DayRecord, Essay, Settings } from './lib/types'

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
      initialHeavy: boolean
    }
  | {
      v: 'dig'
      questions: string[]
      initialStep: number
      initialText: string
      initialFirstAnswer: string
      initialVisibleMs: number
      initialPauses: number
    }
  | { v: 'B' }
  | { v: 'C' }
  | { v: 'done'; justCompleted: boolean; newCard: CoachCard | null; weekCount: number; closeTalkEligible: boolean }
  | { v: 'paused' }
  | { v: 'reread' }
  | { v: 'revise' }
  | { v: 'checkpoint' }
  | { v: 'settings' }

interface PendingCommit {
  timer: number
  text: string
  emotion: string
  question: string
  metrics: SessionAResult['metrics']
  mode: 'drain' | 'dig'
  heavy: boolean
  complete: boolean
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [view, setView] = useState<View>({ v: 'loading' })
  const [dots, setDots] = useState<boolean[]>([])
  const [essayCur, setEssayCur] = useState<Essay | null>(null)
  const [essayLast, setEssayLast] = useState<Essay | null>(null)
  const [candidates, setCandidates] = useState<string[]>([])
  const [carryList, setCarryList] = useState<string[]>([])
  const [capsule, setCapsule] = useState<CapsuleWeek | null>(null)
  const [toast, setToast] = useState(false)
  const [backupNudgeText, setBackupNudgeText] = useState<string | null>(null)
  const [doneExtras, setDoneExtras] = useState<{
    recipient: string | null
    twice: boolean
    phrase: string | null
  }>({ recipient: null, twice: false, phrase: null })
  const [ckHistory, setCkHistory] = useState<CheckpointRecord[]>([])
  const [ckPrevTalk, setCkPrevTalk] = useState<number | null>(null)
  const [ckResume, setCkResume] = useState<{ audio?: ArrayBuffer; mimeType?: string } | null>(null)
  const [ruminating, setRuminating] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureText, setCaptureText] = useState('')

  const pending = useRef<PendingCommit | null>(null)
  const lastQuestion = useRef('')
  const inboxIdRef = useRef<number | undefined>(undefined)
  const prevView = useRef<View>({ v: 'loading' })
  const reviseResult = useRef<{ newCard: CoachCard | null; weekCount: number } | null>(null)
  const ckResult = useRef<{ newCard: CoachCard | null; weekCount: number } | null>(null)
  const finalizing = useRef(false)
  const settingsRef = useRef<Settings | null>(null)

  const updateSettings = async (s: Settings) => {
    settingsRef.current = s
    setSettings(s)
    await saveSettings(s)
  }

  // ---- 5秒遅延コミット(非ブロッキングUndo §2.2) ----
  // 5秒タイマーは日記コミットのみ。完了記録の救済(salvage)は実際に離脱した時
  // (visibilitychange hidden)だけ行う — B/C滞在中に走らせるとC画面のfinalizeと
  // 並走し、コーチカードの取りこぼし・carryQuestionの上書きが起きるため
  const salvageInfo = useRef<{ question: string; mode: 'drain' | 'dig'; complete: boolean } | null>(null)

  const flushPending = async () => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    setToast(false)
    await commitDiary(todayStr(), p.text, p.emotion || null, p.metrics, p.mode, p.heavy)
    await clearDraft()
  }

  const trySalvage = async () => {
    const info = salvageInfo.current
    if (!info || !info.complete || finalizing.current) return
    const s = settingsRef.current
    if (!s) return
    const existing = await dbGet<DayRecord>('days', todayStr())
    if (existing) {
      salvageInfo.current = null
      return
    }
    const consumed = s.carryQuestion === info.question ? null : s.carryQuestion
    const res = await recordCompletion(s, info.mode, consumed)
    await updateSettings(res.settings)
    if (inboxIdRef.current !== undefined) {
      await deleteInbox(inboxIdRef.current).catch(() => undefined)
      inboxIdRef.current = undefined
    }
    salvageInfo.current = null
  }
  const startPending = (
    data: { text: string; emotion: string; question: string; metrics: SessionAResult['metrics'] },
    mode: 'drain' | 'dig',
    heavy: boolean,
    complete: boolean,
    showToast: boolean
  ) => {
    void flushPending()
    const timer = window.setTimeout(() => void flushPending(), 5000)
    pending.current = { timer, ...data, mode, heavy, complete }
    salvageInfo.current = { question: data.question, mode, complete }
    if (showToast) setToast(true)
  }
  const undoPending = () => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    salvageInfo.current = null
    setToast(false)
    // 完了記録が済んだ後に戻った場合は「書き足し」として続きを書く
    const bonus = view.v === 'done'
    setView({
      v: 'A',
      minimal: false,
      bonus,
      question: p.question,
      initialText: p.text,
      initialEmotion: p.emotion,
      initialVisibleMs: p.metrics.durationSec * 1000,
      initialPauses: p.metrics.pauses,
      initialHeavy: p.heavy,
    })
  }

  useEffect(() => {
    const onVis = () => {
      // バックグラウンド移行時は猶予を待たず確定し、離脱した日の完了も救済する(§2.2 §7.1)
      if (document.visibilityState === 'hidden') {
        void (async () => {
          await flushPending()
          await trySalvage()
        })()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ---- 起動 ----
  const [fatal, setFatal] = useState(false)
  useEffect(() => {
    void (async () => {
      try {
        await initClock()
        let s = await loadSettings()
        s = await settleStaleDraft(s)
        await settleBonusDraft()
        await sweepInbox()
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
    } else if (plan.kind === 'reread') {
      setEssayCur(await getCurrentEssay())
      setCarryList(await carryHistoryThisWeek())
      setCapsule(await arrivedCapsule())
      setView({ v: 'reread' })
    } else if (plan.kind === 'revise' && target) {
      setEssayCur(target)
      setView({ v: 'revise' })
    } else if (plan.kind === 'dig') {
      await startDig(s)
    } else {
      await startDrain(s, plan.kind === 'drain' ? plan.minimal : false)
    }
  }

  const startDrain = async (s: Settings, minimal: boolean) => {
    const today = todayStr()
    const draft = await loadDraft()
    const sameDay = draft && draft.date === today && draft.digStep === undefined ? draft : null
    let question: string
    inboxIdRef.current = sameDay?.inboxId
    if (sameDay?.question) {
      question = sameDay.question
    } else if (s.carryQuestion) {
      question = s.carryQuestion
    } else {
      // 問いの優先順位: 持ち越し > インボックス > 問いバンク
      const inbox = await oldestInbox()
      if (inbox && inbox.id !== undefined) {
        question = COPY.inboxQuestion(inbox.text)
        inboxIdRef.current = inbox.id
      } else {
        const r = pickQuestion(s, 'starter')
        question = r.question
        await updateSettings({ ...s, usedQuestionIds: r.usedQuestionIds })
      }
    }
    lastQuestion.current = question
    setRuminating(await checkRumination())
    await saveDraft({
      date: today,
      question,
      text: sameDay?.text ?? '',
      emotionWord: sameDay?.emotionWord ?? '',
      pauses: sameDay?.pauses ?? 0,
      visibleMs: sameDay?.visibleMs ?? 0,
      inboxId: inboxIdRef.current,
      heavyDay: sameDay?.heavyDay ?? false,
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
      initialHeavy: sameDay?.heavyDay ?? false,
    })
  }

  const startDig = async (s: Settings) => {
    const today = todayStr()
    const draft = await loadDraft()
    // 同日の排水の書きかけがあるなら、それを失わないよう排水を続行する
    if (draft && draft.date === today && draft.digStep === undefined && draft.text.trim()) {
      await startDrain(s, false)
      return
    }
    const questions = [...DIG_QUESTIONS]
    if (s.carryQuestion) questions[0] = s.carryQuestion // Q1は持ち越しの問いに差し替え(§3.2)
    lastQuestion.current = questions[0]
    inboxIdRef.current = undefined
    const sameDay = draft && draft.date === today && draft.digStep !== undefined ? draft : null
    setView({
      v: 'dig',
      questions,
      initialStep: sameDay?.digStep ?? 0,
      initialText: sameDay?.text ?? `Q. ${questions[0]}\n`,
      initialFirstAnswer: sameDay?.digFirstAnswer ?? '',
      initialVisibleMs: sameDay?.visibleMs ?? 0,
      initialPauses: sameDay?.pauses ?? 0,
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
    // 声の60秒の変奏: 宛先で話す/二度言い(木曜×第7段階)/フレーズの復路
    let extras = { recipient: null as string | null, twice: false, phrase: null as string | null }
    if (s && closeTalkEligible && stageUnlocked(s, 6)) {
      const essay = await getCurrentEssay()
      extras = {
        recipient: essay && !essay.archivedAt ? essay.recipient || null : null,
        twice: stageUnlocked(s, 7) && new Date().getDay() === 4,
        phrase: await surfacePhrase(),
      }
    }
    setDoneExtras(extras)
    setView({ v: 'done', justCompleted, newCard, weekCount: wc, closeTalkEligible })
  }

  // ---- セッションの流れ ----
  const continueAfterWrite = async () => {
    const s = settingsRef.current!
    if (stageUnlocked(s, 3)) {
      setEssayCur(await getCurrentEssay())
      setEssayLast(await latestPastEssay())
      setCandidates(themeCandidates(s, await recentCarryQuestions()))
      setView({ v: 'B' })
    } else {
      setView({ v: 'C' })
    }
  }

  const finishA = async (r: SessionAResult) => {
    if (r.emotion.trim()) await recordEmotion(r.emotion)
    lastQuestion.current = r.question
    const cur = view
    if (cur.v === 'A' && cur.bonus) {
      // 書き足し: 日記コミットのみ。判定・表示には影響しない(§2.1)
      await commitDiary(todayStr(), r.text, r.emotion || null, r.metrics, 'drain', r.heavyDay)
      await clearBonusDraft()
      await clearDraft() // Undo経由で残った本編のdraftも確定済みなので消す(二重コミット防止)
      await enterDone(false, null, undefined, false)
      return
    }
    startPending(r, 'drain', r.heavyDay, meetsCompletion(r.text), true)
    if (cur.v === 'A' && cur.minimal) {
      // 1文だけでいい日: B・C自動スキップ(§2.1)
      await finalize(null)
      return
    }
    await continueAfterWrite()
  }

  const finishDig = async (r: SessionDigResult) => {
    lastQuestion.current = r.question
    // digはテキストにQ行が混ざるため誤タップUndoトーストは出さない(終端は明示的な「終わる」)
    startPending({ text: r.text, emotion: '', question: r.question, metrics: r.metrics }, 'dig', false, true, false)
    await continueAfterWrite()
  }

  const doneB = async (theme: string, recipient: string, sentence: string) => {
    await addEssaySentence(theme, recipient, sentence)
    setView({ v: 'C' })
  }

  const finalize = async (carry: string | null, mode: 'drain' | 'dig' | 'reread' | 'revise' = 'drain') => {
    if (finalizing.current) return // 完了ボタン連打の二重計上防止
    finalizing.current = true
    try {
      const s = settingsRef.current!
      // 執筆モードはsalvageInfoが正(pendingは5秒で流れて消えるため)
      const actualMode = mode === 'drain' ? (salvageInfo.current?.mode ?? mode) : mode
      const res = await recordCompletion(s, actualMode, carry)
      await updateSettings(res.settings)
      salvageInfo.current = null
      if (inboxIdRef.current !== undefined) {
        await deleteInbox(inboxIdRef.current).catch(() => undefined)
        inboxIdRef.current = undefined
      }
      await enterDone(true, res.newCard, res.weekCount, mode === 'drain' || mode === 'dig')
    } finally {
      finalizing.current = false
    }
  }

  // ---- 再読・推敲・定点観測 ----
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

  const ckRecorded = async (audio: ArrayBuffer | null, mimeType: string | null) => {
    const s = settingsRef.current!
    const res = await recordCompletion(s, 'checkpoint', s.carryQuestion)
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
      // 音声が大きすぎて保存できない場合は指標だけ残す(数字が本体 §9.3)
      await saveCheckpoint(base).catch(() => undefined)
    }
  }

  const ckSaveMetrics = async (m: {
    wordCount: number | null
    fillerCount: number | null
    silenceCount: number | null
  }) => {
    const rec = await getCheckpoint(monthStr())
    // レコードが無い(保存失敗した)場合も、入力された指標を黙って捨てない
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
      // 月替わり: 前月分を退避してから数え直す(定点観測が「先月の声出し」に使う §3.6)
      await updateSettings({
        ...s,
        closeTalkPrev: s.closeTalk.month ? s.closeTalk : s.closeTalkPrev,
        closeTalk: { month: m, count: 1 },
      })
    }
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
      initialHeavy: false,
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

  const onHeavyOn = async (): Promise<string> => {
    const s = settingsRef.current!
    const r = pickQuestion(s, 'distance')
    await updateSettings({ ...s, usedQuestionIds: r.usedQuestionIds })
    lastQuestion.current = r.question
    return r.question
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
          question: d?.question ?? pv.question, // 重い日で差し替えた距離問いも復元する
          initialText: d?.text ?? pv.initialText,
          initialEmotion: d?.emotionWord ?? pv.initialEmotion,
          initialVisibleMs: d?.visibleMs ?? pv.initialVisibleMs,
          initialPauses: d?.pauses ?? pv.initialPauses,
          initialHeavy: d?.heavyDay ?? pv.initialHeavy,
        })
      }
    } else if (pv.v === 'dig') {
      const d = await loadDraft()
      if (d && d.digStep !== undefined) {
        setView({
          ...pv,
          initialStep: d.digStep,
          initialText: d.text,
          initialFirstAnswer: d.digFirstAnswer ?? '',
          initialVisibleMs: d.visibleMs,
          initialPauses: d.pauses,
        })
      } else {
        setView(pv)
      }
    } else if (pv.v === 'B' || pv.v === 'C') {
      setView(pv)
    } else {
      await route(settingsRef.current!)
    }
  }

  const saveCapture = async () => {
    if (captureText.trim()) await addInbox(captureText)
    setCaptureText('')
    setCaptureOpen(false)
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

  const openCapture = () => setCaptureOpen(true)

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
          initialHeavy={view.initialHeavy}
          showEmotion={stageUnlocked(settings, 2) && !view.minimal && !view.bonus}
          canRephrase={stageUnlocked(settings, 7)}
          canHeavy={stageUnlocked(settings, 8) && !view.minimal && !view.bonus}
          rumination={ruminating}
          inboxId={inboxIdRef.current}
          onHeavyOn={onHeavyOn}
          onFinish={(r) => void finishA(r)}
          onPause={() => setView({ v: 'paused' })}
          onBackspaceHintShown={() => void updateSettings({ ...settingsRef.current!, backspaceHintShown: true })}
          onSettings={openSettings}
          onCapture={openCapture}
        />
      )}
      {view.v === 'dig' && (
        <SessionDig
          settings={settings}
          questions={view.questions}
          initialStep={view.initialStep}
          initialText={view.initialText}
          initialFirstAnswer={view.initialFirstAnswer}
          initialVisibleMs={view.initialVisibleMs}
          initialPauses={view.initialPauses}
          onFinish={(r) => void finishDig(r)}
          onPause={() => setView({ v: 'paused' })}
          onBackspaceHintShown={() => void updateSettings({ ...settingsRef.current!, backspaceHintShown: true })}
          onSettings={openSettings}
          onCapture={openCapture}
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
          closeTalkRecipient={doneExtras.recipient}
          closeTalkTwice={doneExtras.twice}
          surfacedPhrase={doneExtras.phrase}
          showReminderGuide={view.justCompleted && !settings.reminderGuideShown}
          backupNudge={backupNudgeText}
          onCloseTalk={() => void closeTalk()}
          onDismissReminderGuide={() => void updateSettings({ ...settingsRef.current!, reminderGuideShown: true })}
          onBonus={() => void bonus()}
          onSettings={openSettings}
          onCapture={openCapture}
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
        <Reread
          essay={essayCur}
          carryHistory={carryList}
          capsule={capsule}
          onOpenCapsule={async (c) => {
            const o = await openCapsule(c)
            await setCapsuleState(c, 'opened')
            return o
          }}
          onDiscardCapsule={(c) => setCapsuleState(c, 'discarded')}
          onDone={() => void doneReread()}
          onSettings={openSettings}
          onCapture={openCapture}
        />
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
      {view.v === 'checkpoint' && (
        <Checkpoint
          history={ckHistory}
          prevTalkCount={ckPrevTalk}
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
        <button class="undo-toast fade-in" onClick={undoPending}>
          {COPY.undoToast}
        </button>
      )}
      {captureOpen && (
        <div class="capture-overlay" onClick={(e) => e.target === e.currentTarget && setCaptureOpen(false)}>
          <div class="capture-box">
            <p class="hint-static">{COPY.captureTitle}</p>
            <input
              class="text-input"
              value={captureText}
              placeholder={COPY.capturePlaceholder}
              onInput={(e: any) => setCaptureText(e.currentTarget.value)}
            />
            <div class="row">
              <button class="primary" disabled={!captureText.trim()} onClick={() => void saveCapture()}>
                {COPY.captureSave}
              </button>
              <button class="ghost" onClick={() => setCaptureOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
