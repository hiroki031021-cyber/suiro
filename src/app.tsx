import { useEffect, useRef, useState } from 'preact/hooks'
import { Intro } from './screens/Intro'
import { Sheet, type SheetResult } from './screens/Sheet'
import { Done } from './screens/Done'
import { Review } from './screens/Review'
import { SettingsScreen } from './screens/Settings'
import { COPY } from './lib/copy'
import { todayStr } from './lib/clock'
import { TITLE_BANK } from './data/titleBank'
import {
  addPage,
  arrived,
  clearDraft,
  loadDraft,
  loadSettings,
  markReviewed,
  pagesOn,
  saveSettings,
  settleStaleDraft,
  weekCounts,
  type Arrival,
} from './lib/store'
import type { Draft, Settings } from './lib/types'

type View =
  | { v: 'loading' }
  | { v: 'intro' }
  | { v: 'sheet'; index: number; draft: Draft | null; presetTitle: string | null; parentId?: string; key: number }
  | { v: 'done'; count: number; week: number[]; arrival: Arrival | null }
  | { v: 'review'; arrival: Arrival }
  | { v: 'settings' }

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [view, setView] = useState<View>({ v: 'loading' })
  const [updateReady, setUpdateReady] = useState(false)
  const sref = useRef<Settings | null>(null)
  const prev = useRef<View>({ v: 'loading' })
  const seq = useRef(0)

  const update = async (s: Settings) => {
    sref.current = s
    setSettings(s)
    await saveSettings(s)
  }

  useEffect(() => {
    const on = () => setUpdateReady(true)
    window.addEventListener('app:update', on)
    return () => window.removeEventListener('app:update', on)
  }, [])

  useEffect(() => {
    void (async () => {
      await settleStaleDraft()
      const s = await loadSettings()
      sref.current = s
      setSettings(s)
      if (navigator.storage?.persist) void navigator.storage.persist()
      if (!s.introSeen) setView({ v: 'intro' })
      else await route(s)
    })()
  }, [])

  // 起動: 今日の枚数が目標未満なら紙、達していれば完了画面
  const route = async (s: Settings) => {
    const today = await pagesOn(todayStr())
    if (today.length >= s.pagesPerDay) await enterDone(today.length)
    else await startSheet(today.length, null)
  }

  const startSheet = async (index: number, presetTitle: string | null, parentId?: string) => {
    const d = await loadDraft()
    const draft = d && d.date === todayStr() && !presetTitle ? d : null
    seq.current++
    setView({ v: 'sheet', index, draft, presetTitle, parentId: parentId ?? draft?.parentId, key: seq.current })
  }

  const enterDone = async (count?: number) => {
    const c = count ?? (await pagesOn(todayStr())).length
    setView({ v: 'done', count: c, week: await weekCounts(), arrival: await arrived() })
  }

  const closeSheet = async (r: (SheetResult & { nextTitle?: string }) | null) => {
    const s = sref.current!
    let parentId: string | undefined
    if (r) {
      const p = await addPage({ date: todayStr(), title: r.title, body: r.body, createdAt: Date.now(), durationMs: r.durationMs, parentId: r.parentId })
      parentId = p.id
    }
    await clearDraft()
    const count = (await pagesOn(todayStr())).length
    if (r?.nextTitle) await startSheet(count, r.nextTitle, parentId)
    else if (count >= s.pagesPerDay) await enterDone(count)
    else await startSheet(count, null)
  }

  const finishToday = async (r: SheetResult | null) => {
    if (r) await addPage({ date: todayStr(), title: r.title, body: r.body, createdAt: Date.now(), durationMs: r.durationMs, parentId: r.parentId })
    await clearDraft()
    await enterDone()
  }

  const takeTitle = () => {
    const s = sref.current!
    const t = TITLE_BANK[s.bankIndex % TITLE_BANK.length]
    void update({ ...s, bankIndex: (s.bankIndex + 1) % TITLE_BANK.length })
    return t
  }

  if (!settings || view.v === 'loading') return <div class="screen center" />

  return (
    <>
      {view.v === 'intro' && (
        <Intro
          onStart={() => {
            void update({ ...settings, introSeen: true }).then(() => route(sref.current!))
          }}
        />
      )}
      {view.v === 'sheet' && (
        <Sheet
          key={view.key}
          settings={settings}
          index={view.index}
          draft={view.draft}
          presetTitle={view.presetTitle}
          parentId={view.parentId}
          onClose={(r) => void closeSheet(r)}
          onFinishToday={(r) => void finishToday(r)}
          onTakeTitle={takeTitle}
          onSettings={() => {
            prev.current = view
            setView({ v: 'settings' })
          }}
        />
      )}
      {view.v === 'done' && (
        <Done
          count={view.count}
          goal={settings.pagesPerDay}
          weekCounts={view.week}
          arrival={view.arrival}
          onOneMore={() => void startSheet(view.count, null)}
          onReview={() => view.arrival && setView({ v: 'review', arrival: view.arrival })}
          onSettings={() => {
            prev.current = view
            setView({ v: 'settings' })
          }}
        />
      )}
      {view.v === 'review' && (
        <Review
          arrival={view.arrival}
          onDone={() => void markReviewed(view.arrival).then(() => enterDone())}
        />
      )}
      {view.v === 'settings' && (
        <SettingsScreen
          settings={settings}
          onChange={(s) => void update(s)}
          onBack={() => {
            const pv = prev.current
            if (pv.v === 'sheet') void startSheet(pv.index, pv.presetTitle, pv.parentId)
            else void route(sref.current!)
          }}
        />
      )}
      {updateReady && view.v !== 'sheet' && (
        <button class="update-toast fade-in" onClick={() => location.reload()}>
          {COPY.updateReady}
        </button>
      )}
    </>
  )
}
