// 端末内IndexedDB。旧アプリ(suiro)のDBには触らない
const DB_NAME = 'zerobyo'
const DB_VERSION = 1

export type StoreName = 'kv' | 'pages'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
        if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages', { keyPath: 'id' })
      }
      req.onsuccess = () => {
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
        // 書き込みはtxのcommit完了でresolve(onsuccess時点では未コミット)
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

export const dbGet = <T>(store: StoreName, key: IDBValidKey) => run<T | undefined>(store, 'readonly', (s) => s.get(key))
export const dbPut = <T>(store: StoreName, value: T, key?: IDBValidKey) =>
  run<IDBValidKey>(store, 'readwrite', (s) => (key !== undefined ? s.put(value, key) : s.put(value)))
export const dbDel = (store: StoreName, key: IDBValidKey) => run<undefined>(store, 'readwrite', (s) => s.delete(key))
export const dbGetAll = <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll())
export const dbClear = (store: StoreName) => run<undefined>(store, 'readwrite', (s) => s.clear())
