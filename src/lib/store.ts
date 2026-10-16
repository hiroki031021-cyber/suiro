import { dbClear, dbDel, dbGet, dbGetAll, dbPut } from './db'
import { addDays, todayStr, weekMonday } from './clock'
import { DEFAULT_SETTINGS, type Draft, type Page, type Settings } from './types'

// ---- settings ----
export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await dbGet<Partial<Settings>>('kv', 'settings')) }
}
export const saveSettings = (s: Settings) => dbPut('kv', s, 'settings')

// ---- draft(同日内の中断復帰用) ----
export const loadDraft = () => dbGet<Draft>('kv', 'draft')
export const saveDraft = (d: Draft) => dbPut('kv', d, 'draft')
export const clearDraft = () => dbDel('kv', 'draft')

// ---- pages ----
/** 紙として残る条件: 本文が1行でもある(題だけの紙は残らない) */
export const pageHasBody = (_title: string, body: string) => body.trim().length > 0

export async function addPage(p: Omit<Page, 'id' | 'reviews'>): Promise<Page> {
  const page: Page = { ...p, id: `${p.date}#${p.createdAt}`, reviews: 0 }
  await dbPut('pages', page)
  return page
}
export const putPage = (p: Page) => dbPut('pages', p)

export async function listPages(): Promise<Page[]> {
  return (await dbGetAll<Page>('pages')).sort((a, b) => a.createdAt - b.createdAt)
}

export async function pagesOn(date: string): Promise<Page[]> {
  return (await listPages()).filter((p) => p.date === date)
}

/** 今週(月〜日)の日ごとの枚数 */
export async function weekCounts(): Promise<number[]> {
  const monday = weekMonday()
  const all = await listPages()
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i)
    return all.filter((p) => p.date === d).length
  })
}

/** 下書きが前日以前のものなら、そのまま紙として確定する(読み返さない) */
export async function settleStaleDraft(): Promise<void> {
  const d = await loadDraft()
  if (!d) return
  if (d.date !== todayStr() && pageHasBody(d.title, d.body)) {
    await addPage({
      date: d.date,
      title: d.title.trim(),
      body: d.body.trim(),
      createdAt: Date.now(),
      durationMs: d.elapsedMs,
      parentId: d.parentId,
    })
  }
  if (d.date !== todayStr()) await clearDraft()
}

// ---- 見返し(3か月後・6か月後に、その日の束が1日分ずつ届く) ----
export interface Arrival {
  date: string
  round: 1 | 2
  pages: Page[]
}

export async function arrived(): Promise<Arrival | null> {
  const today = todayStr()
  const all = await listPages()
  const due = all.filter(
    (p) => (p.reviews === 0 && p.date <= addDays(today, -90)) || (p.reviews === 1 && p.date <= addDays(today, -180))
  )
  if (due.length === 0) return null
  // 最も古い日付の束から。同じ日付に0回と1回が混在することはない(束ごとに進めるため)
  due.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
  const date = due[0].date
  const round = due[0].reviews === 0 ? 1 : 2
  return { date, round, pages: due.filter((p) => p.date === date && p.reviews === round - 1) }
}

export async function markReviewed(a: Arrival): Promise<void> {
  for (const p of a.pages) await putPage({ ...p, reviews: p.reviews + 1 })
}

// ---- 書き出し・バックアップ ----
export function toMarkdown(pages: Page[]): string {
  const byDate = new Map<string, Page[]>()
  for (const p of pages) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p])
  return [...byDate.entries()]
    .map(
      ([date, ps]) =>
        `# ${date}\n\n` +
        ps
          .map((p) => `## ${p.title || '(無題)'}\n${p.body.split('\n').filter(Boolean).map((l) => `- ${l}`).join('\n')}`)
          .join('\n\n')
    )
    .join('\n\n---\n\n')
}

export interface Backup {
  app: 'zerobyo'
  v: 1
  createdAt: number
  settings: Settings
  pages: Page[]
}

export async function exportBackup(): Promise<Backup> {
  return { app: 'zerobyo', v: 1, createdAt: Date.now(), settings: await loadSettings(), pages: await listPages() }
}

export async function importBackup(text: string): Promise<number> {
  const b = JSON.parse(text) as Backup
  if (b.app !== 'zerobyo' || b.v !== 1 || !Array.isArray(b.pages)) throw new Error('バックアップファイルではありません')
  await dbClear('pages')
  for (const p of b.pages) await dbPut('pages', p)
  if (b.settings) await saveSettings({ ...DEFAULT_SETTINGS, ...b.settings, introSeen: true })
  await clearDraft()
  return b.pages.length
}

export function download(name: string, text: string, type = 'text/plain'): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
