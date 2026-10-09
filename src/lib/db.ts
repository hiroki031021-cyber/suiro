const DB_NAME = 'suiro'
const DB_VERSION = 3 // v2: checkpoints, inbox / v3: notes(五つの段 §14)

export type StoreName =
  | 'kv'
  | 'diary'
  | 'essays'
  | 'phrases'
  | 'emotions'
  | 'days'
  | 'checkpoints'
  | 'inbox'
  | 'notes'

export const ALL_STORES: StoreName[] = [
  'kv',
  'diary',
  'essays',
  'phrases',
  'emotions',
  'days',
  'checkpoints',
  'inbox',
  'notes',
]

let dbPromise: Promise<IDBDatabase> | null = null

export function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onblocked = () => {
        const el = document.getElementById('app')
        if (el)
          el.textContent = '別のタブ/ウィンドウで水路が開いています。そちらを閉じてから、再読み込みしてください。'
      }
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
        if (!db.objectStoreNames.contains('diary')) db.createObjectStore('diary', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('essays')) db.createObjectStore('essays', { keyPath: 'weekOf' })
        if (!db.objectStoreNames.contains('phrases'))
          db.createObjectStore('phrases', { keyPath: 'id', autoIncrement: true })
        if (!db.objectStoreNames.contains('emotions')) db.createObjectStore('emotions', { keyPath: 'word' })
        if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' })
        if (!db.objectStoreNames.contains('checkpoints'))
          db.createObjectStore('checkpoints', { keyPath: 'month' })
        if (!db.objectStoreNames.contains('inbox'))
          db.createObjectStore('inbox', { keyPath: 'id', autoIncrement: true })
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'date' })
      }
      req.onsuccess = () => {
        // 別タブが新バージョンでDBを開いたら、このタブは閉じて再読込(旧SWキャッシュとの併走対策)
        req.result.onversionchange = () => {
          req.result.close()
          location.reload()
        }
        resolve(req.result)
      }
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        if (mode === 'readonly') {
          req.onsuccess = () => resolve(req.result as T)
          req.onerror = () => reject(req.error)
          return
        }
        // 書き込みは req.onsuccess でなく tx の commit 完了で resolve する。
        // onsuccess時点では未コミットで、直後のリロード/プロセス破棄で消え得る
        let result: T
        req.onsuccess = () => {
          result = req.result as T
        }
        t.oncomplete = () => resolve(result)
        t.onabort = () => reject(t.error)
        t.onerror = () => reject(t.error)
      })
  )
}

export const dbGet = <T>(store: StoreName, key: IDBValidKey) =>
  run<T | undefined>(store, 'readonly', (s) => s.get(key))
export const dbPut = <T>(store: StoreName, value: T, key?: IDBValidKey) =>
  run<IDBValidKey>(store, 'readwrite', (s) => (key !== undefined ? s.put(value, key) : s.put(value)))
export const dbDel = (store: StoreName, key: IDBValidKey) =>
  run<undefined>(store, 'readwrite', (s) => s.delete(key))
export const dbGetAll = <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll())
export const dbClear = (store: StoreName) => run<undefined>(store, 'readwrite', (s) => s.clear())
