const DB_NAME = 'suiro'
const DB_VERSION = 1

export type StoreName = 'kv' | 'diary' | 'essays' | 'phrases' | 'emotions' | 'days'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
        if (!db.objectStoreNames.contains('diary')) db.createObjectStore('diary', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('essays')) db.createObjectStore('essays', { keyPath: 'weekOf' })
        if (!db.objectStoreNames.contains('phrases'))
          db.createObjectStore('phrases', { keyPath: 'id', autoIncrement: true })
        if (!db.objectStoreNames.contains('emotions')) db.createObjectStore('emotions', { keyPath: 'word' })
        if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' })
      }
      req.onsuccess = () => resolve(req.result)
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
