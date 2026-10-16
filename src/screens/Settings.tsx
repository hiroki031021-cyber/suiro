import { useEffect, useState } from 'preact/hooks'
import { download, exportBackup, importBackup, listPages, toMarkdown } from '../lib/store'
import type { Settings } from '../lib/types'

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  onBack: () => void
}

export function SettingsScreen({ settings, onChange, onBack }: Props) {
  const [count, setCount] = useState(0)
  const [msg, setMsg] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    void listPages().then((p) => setCount(p.length))
    if (navigator.storage?.persisted) void navigator.storage.persisted().then(setPersisted)
  }, [])
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch })

  const checkUpdate = async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
      const j = (await r.json()) as { version?: string }
      if (!j.version) throw new Error()
      if (j.version === __APP_VERSION__) {
        setMsg(`これが最新(${j.version})`)
        return
      }
      setMsg(`公開中は ${j.version}。更新して読み直す…`)
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.update()
      window.setTimeout(() => location.reload(), 1500)
    } catch {
      setMsg('確認できなかった(オフライン?)')
    }
  }
  const hardRefresh = async () => {
    try {
      for (const r of (await navigator.serviceWorker?.getRegistrations()) ?? []) await r.unregister()
      for (const k of await caches.keys()) await caches.delete(k)
    } catch {
      /* 続行 */
    }
    location.reload()
  }

  return (
    <div class="screen settings">
      <header class="bar">
        <span class="mode-label">設定</span>
        <div class="bar-right">
          <button class="ghost" onClick={onBack}>
            戻る
          </button>
        </div>
      </header>

      <div class="section-label">紙</div>
      <label class="field-label">1日の枚数</label>
      <select class="text-input" value={String(settings.pagesPerDay)} onChange={(e: any) => set({ pagesPerDay: Number(e.currentTarget.value) })}>
        <option value="5">5枚</option>
        <option value="10">10枚(原著)</option>
        <option value="15">15枚</option>
      </select>
      <label class="field-label">1枚の時間</label>
      <select class="text-input" value={String(settings.secondsPerPage)} onChange={(e: any) => set({ secondsPerPage: Number(e.currentTarget.value) })}>
        <option value="60">1分(原著)</option>
        <option value="90">1分30秒</option>
      </select>

      <div class="section-label">データ</div>
      <p class="note">
        {count}枚。すべてこの端末の中。外には送らない。
        {persisted !== null && (persisted ? ' ストレージは永続化済み。' : ' ストレージは未永続化 — ホーム画面に追加すると安全。')}
      </p>
      <div class="row">
        <button class="ghost" onClick={() => void listPages().then((p) => download('zerobyo.md', toMarkdown(p), 'text/markdown'))}>
          Markdownで書き出す
        </button>
        <button
          class="ghost"
          onClick={() =>
            void exportBackup().then((b) => download(`zerobyo-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b), 'application/json'))
          }
        >
          バックアップ(JSON)
        </button>
      </div>
      <label class="field-label">復元(JSON)</label>
      <input
        class="text-input"
        type="file"
        accept="application/json"
        onChange={(e: any) => {
          const f = e.currentTarget.files?.[0]
          if (!f) return
          void f
            .text()
            .then((t: string) => importBackup(t))
            .then((n: number) => {
              setMsg(`${n}枚を復元した`)
              window.setTimeout(() => location.reload(), 800)
            })
            .catch(() => setMsg('復元できなかった'))
        }}
      />

      <div class="section-label">更新</div>
      <p class="note">ビルド {__APP_VERSION__}</p>
      <div class="row">
        <button class="ghost" onClick={() => void checkUpdate()}>
          更新を確認
        </button>
        <button class="ghost" onClick={() => void hardRefresh()}>
          キャッシュを捨てて読み直す
        </button>
      </div>
      {msg && <p class="note">{msg}</p>}
    </div>
  )
}
