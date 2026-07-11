import { dbGet, dbGetAll, openDB } from './db'
import type { DayRecord, DiaryEntry, EmotionEntry, EncBody, Essay, Phrase, Settings } from './types'

// マスター鍵は生バイトで端末に保存する。バックアップ時にパスフレーズ由来のKEKで
// ラップするには鍵素材が必要で、extractable:false のCryptoKeyは後からwrapできない。
// 同一端末内の保護が難読化に留まる点は仕様§9.2「正直な注記」の範囲。
let keyPromise: Promise<CryptoKey> | null = null

async function getRawKey(): Promise<Uint8Array> {
  // get→生成→put を単一のreadwrite txで行う。2コンテキスト同時初回起動で
  // 別々の鍵が生成されると、負けた側の日記が永久に復号不能になるため
  const db = await openDB()
  return new Promise<Uint8Array>((resolve, reject) => {
    const t = db.transaction('kv', 'readwrite')
    const store = t.objectStore('kv')
    const req = store.get('keyRaw')
    let raw: Uint8Array
    req.onsuccess = () => {
      const existing = req.result as Uint8Array | undefined
      if (existing) {
        raw = existing
      } else {
        raw = crypto.getRandomValues(new Uint8Array(32))
        store.put(raw, 'keyRaw')
      }
    }
    t.oncomplete = () => resolve(raw)
    t.onabort = () => reject(t.error)
    t.onerror = () => reject(t.error)
  })
}

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = getRawKey().then((raw) =>
      crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
    )
  }
  return keyPromise
}

export async function encryptText(text: string): Promise<EncBody> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await getKey(),
    new TextEncoder().encode(text)
  )
  return { iv, ct }
}

// unlockAt前の復号パスはUIに存在させない(§9.2)。タイムカプセル(v1.1)がここを呼ぶ。
export async function decryptText(body: EncBody): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: body.iv as BufferSource },
    await getKey(),
    body.ct
  )
  return new TextDecoder().decode(pt)
}

// ---------- base64 ----------

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return u8
}

// ---------- バックアップ(§9.3) ----------

async function kekFromPassphrase(pass: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

interface BackupFile {
  v: 1
  app: 'suiro'
  createdAt: number
  salt: string
  iv: string
  data: string
}

interface SerializedDiary extends Omit<DiaryEntry, 'bodyEnc'> {
  bodyEnc: { iv: string; ct: string }
}

interface BackupPayload {
  keyRaw: string
  settings: Settings | undefined
  monotonicClock: number | undefined
  diary: SerializedDiary[]
  essays: Essay[]
  phrases: Phrase[]
  emotions: EmotionEntry[]
  days: DayRecord[]
}

export async function exportBackup(pass: string): Promise<Blob> {
  const diary = (await dbGetAll<DiaryEntry>('diary')).map((d) => ({
    ...d,
    bodyEnc: { iv: toB64(d.bodyEnc.iv), ct: toB64(d.bodyEnc.ct) },
  }))
  const payload: BackupPayload = {
    keyRaw: toB64(await getRawKey()),
    settings: await dbGet<Settings>('kv', 'settings'),
    monotonicClock: await dbGet<number>('kv', 'monotonicClock'),
    diary,
    essays: await dbGetAll<Essay>('essays'),
    phrases: await dbGetAll<Phrase>('phrases'),
    emotions: await dbGetAll<EmotionEntry>('emotions'),
    days: await dbGetAll<DayRecord>('days'),
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const kek = await kekFromPassphrase(pass, salt)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    new TextEncoder().encode(JSON.stringify(payload))
  )
  const file: BackupFile = {
    v: 1,
    app: 'suiro',
    createdAt: Date.now(),
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(ct),
  }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

export async function importBackup(fileText: string, pass: string): Promise<void> {
  const file = JSON.parse(fileText) as BackupFile
  if (file.app !== 'suiro' || file.v !== 1) throw new Error('バックアップファイルではありません')
  const kek = await kekFromPassphrase(pass, fromB64(file.salt))
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(file.iv) as BufferSource },
    kek,
    fromB64(file.data) as BufferSource
  )
  const payload = JSON.parse(new TextDecoder().decode(pt)) as BackupPayload

  try {
    // 復元は全ストアにまたがる単一txで行う。途中失敗時は自動abortで元データが残る
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(['kv', 'diary', 'essays', 'phrases', 'emotions', 'days'], 'readwrite')
      for (const s of ['diary', 'essays', 'phrases', 'emotions', 'days'] as const) t.objectStore(s).clear()
      const kv = t.objectStore('kv')
      kv.put(fromB64(payload.keyRaw), 'keyRaw')
      if (payload.settings) kv.put(payload.settings, 'settings')
      if (payload.monotonicClock !== undefined) kv.put(payload.monotonicClock, 'monotonicClock')
      // 復元前の書きかけが別データセットに混入しないよう消す
      kv.delete('draft')
      kv.delete('bonusDraft')
      for (const d of payload.diary)
        t.objectStore('diary').put({ ...d, bodyEnc: { iv: fromB64(d.bodyEnc.iv), ct: fromB64(d.bodyEnc.ct).buffer } })
      for (const e of payload.essays) t.objectStore('essays').put(e)
      for (const p of payload.phrases) t.objectStore('phrases').put(p)
      for (const e of payload.emotions) t.objectStore('emotions').put(e)
      for (const d of payload.days) t.objectStore('days').put(d)
      t.oncomplete = () => resolve()
      t.onabort = () => reject(t.error)
      t.onerror = () => reject(t.error)
    })
  } finally {
    keyPromise = null
  }
}
