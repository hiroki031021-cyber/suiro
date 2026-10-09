import { useEffect, useState } from 'preact/hooks'
import { COACH_CARDS } from '../data/coachCards'
import { COPY } from '../lib/copy'
import { dbGetAll } from '../lib/db'
import { exportBackup, importBackup } from '../lib/crypto'
import { downloadIcs } from '../lib/ics'
import { stageUnlocked } from '../lib/schedule'
import { downloadText, listNotes, notesToMarkdown } from '../lib/store'
import type { Essay, Note, Settings } from '../lib/types'

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  onBack: () => void
}

export function SettingsScreen({ settings, onChange, onBack }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [archived, setArchived] = useState<Essay[]>([])
  const [pass, setPass] = useState('')
  const [importPass, setImportPass] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void listNotes().then(setNotes)
    void dbGetAll<Essay>('essays').then((all) =>
      setArchived(all.filter((e) => e.sentences.length > 0).sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1)))
    )
    if (navigator.storage?.persisted) void navigator.storage.persisted().then(setPersisted)
  }, [])

  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch })

  const doExport = async () => {
    if (!pass) {
      setMsg('バックアップ用のパスフレーズを入れてください')
      return
    }
    const blob = await exportBackup(pass)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `suiro-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    set({ lastBackupAt: Date.now() })
    setMsg('書き出した。このファイルとパスフレーズがあれば、新しい端末で全データを復元できる。どちらか一方では誰にも(自分にも)読めない。')
  }

  const doImport = async (file: File) => {
    try {
      await importBackup(await file.text(), importPass)
      location.reload()
    } catch {
      setMsg('復元できなかった。ファイルかパスフレーズを確認してください')
    }
  }

  const exportEssays = () => {
    const md = archived
      .map(
        (e) =>
          `# ${e.theme}\n\n宛先: ${e.recipient}(${e.weekOf}の週)\n\n${e.sentences
            .map((s) => s.text)
            .join('\n')}\n${e.replyImagined ? `\n> ${e.replyImagined}\n` : ''}`
      )
      .join('\n\n---\n\n')
    downloadText('suiro-essays.md', md, 'text/markdown')
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

      <div class="section-label">習慣</div>
      <label class="field-label">「◯◯したら、書く」</label>
      <input
        class="text-input"
        value={settings.ifThenText}
        onInput={(e: any) => set({ ifThenText: e.currentTarget.value })}
      />
      <label class="field-label">それは大体何時?</label>
      <input
        class="text-input"
        type="time"
        value={settings.notifyTime}
        onInput={(e: any) => set({ notifyTime: e.currentTarget.value })}
      />
      <div class="row">
        <button class="ghost" onClick={() => downloadIcs(settings.notifyTime)}>
          カレンダー用(.ics)を保存
        </button>
        {'Notification' in window && Notification.permission === 'default' && (
          <button class="ghost" onClick={() => void Notification.requestPermission()}>
            アプリ内通知を許可
          </button>
        )}
      </div>
      <p class="note">
        確実な合図はOSのリマインダー(「{COPY.reminderFixed}」を毎日{settings.notifyTime}
        に)。アプリ内通知は、開いている間しか鳴らない。
      </p>

      <div class="section-label">書く</div>
      <label class="field-label">完了フレーズ</label>
      <input
        class="text-input"
        value={settings.donePhrase}
        onInput={(e: any) => set({ donePhrase: e.currentTarget.value })}
      />
      <label class="field-label">1日の持ち時間(声の60秒を含む。各段の配分は比例して伸縮)</label>
      <select
        class="text-input"
        value={String(settings.sessionMinutes)}
        onChange={(e: any) => set({ sessionMinutes: Number(e.currentTarget.value) })}
      >
        <option value="10">10分</option>
        <option value="15">15分(標準)</option>
        <option value="20">20分</option>
      </select>

      <div class="section-label">型の稽古</div>
      <label class="check-row">
        <input
          type="checkbox"
          checked={settings.unlockAll}
          onChange={(e: any) => set({ unlockAll: e.currentTarget.checked })}
        />
        全部いますぐ解禁する
      </label>
      {COACH_CARDS.filter((c) => stageUnlocked(settings, c.stage)).map((c) => (
        <details key={c.stage} class="card-details">
          <summary>{c.title}</summary>
          <p>{c.body}</p>
          {c.back.map((b, i) => (
            <p key={i} class="card-back">
              {b}
            </p>
          ))}
        </details>
      ))}

      <div class="section-label">ノート</div>
      {notes.length === 0 ? (
        <p class="empty">まだない</p>
      ) : (
        <>
          <p class="note">{notes.length}日分。日々の読み返しはしない — 日曜に今週の②が並ぶ。</p>
          <button class="ghost" onClick={() => downloadText('suiro-notes.md', notesToMarkdown(notes), 'text/markdown')}>
            Markdownで書き出す
          </button>
        </>
      )}

      {archived.length > 0 && (
        <>
          <div class="section-label">以前のエッセイ(v1)</div>
          {archived.map((e) => (
            <details key={e.weekOf} class="card-details">
              <summary>
                {e.theme} <span class="s-date">({e.weekOf}の週 → {e.recipient})</span>
              </summary>
              {e.sentences.map((s, i) => (
                <p key={i}>{s.text}</p>
              ))}
              {e.replyImagined && <p class="card-back">「{e.replyImagined}」</p>}
            </details>
          ))}
          <button class="ghost" onClick={exportEssays}>
            Markdownで書き出す
          </button>
        </>
      )}

      <div class="section-label">データ</div>
      <p class="note">
        すべてこの端末の中にある。外には送らない。
        {persisted !== null && (persisted ? ' ストレージは永続化済み。' : ' ストレージは未永続化 — ホーム画面に追加すると安全。')}
      </p>
      <label class="field-label">バックアップ用パスフレーズ</label>
      <input
        class="text-input"
        type="password"
        value={pass}
        onInput={(e: any) => setPass(e.currentTarget.value)}
      />
      <button class="ghost" onClick={() => void doExport()}>
        完全バックアップを書き出す
      </button>
      <label class="field-label">復元(ファイル+パスフレーズ)</label>
      <input
        class="text-input"
        type="password"
        placeholder="パスフレーズ"
        value={importPass}
        onInput={(e: any) => setImportPass(e.currentTarget.value)}
      />
      <input
        class="text-input"
        type="file"
        accept="application/json"
        onChange={(e: any) => {
          const f = e.currentTarget.files?.[0]
          if (f) void doImport(f)
        }}
      />
      {msg && <p class="note">{msg}</p>}
    </div>
  )
}
