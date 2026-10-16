// 水路 service worker — installでコアをプリキャッシュ+ネットワーク優先/キャッシュフォールバック
// パスはすべてSWのスコープ相対(GitHub Pagesのサブパス配信に対応)
const CACHE = 'suiro-v9'
const CORE = ['./', './manifest.webmanifest', './icon.svg', './icon-512.png', './apple-touch-icon.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(CORE)
      try {
        // index.htmlが参照するハッシュ付きアセット(JS/CSS)もプリキャッシュする
        const res = await cache.match('./')
        if (res) {
          const html = await res.text()
          const assets = [...html.matchAll(/(?:\.\/)?assets\/[^"' )]+/g)].map((m) =>
            new URL(m[0], self.location.href).href
          )
          if (assets.length) await cache.addAll([...new Set(assets)])
        }
      } catch {
        // アセット解析失敗時もコアは入っている(2回目以降のfetchで埋まる)
      }
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
        // ナビゲーション(index.html)はHTTPキャッシュを使わず再検証する。GitHub Pagesはmax-age=600を返すため、
        // 更新直後に古いindex→古いJSが10分間使われ続けるのを防ぐ
        const res = await fetch(e.request, e.request.mode === 'navigate' ? { cache: 'no-cache' } : undefined)
        if (res.ok) await cache.put(e.request, res.clone())
        return res
      } catch {
        const hit = await cache.match(e.request)
        if (hit) return hit
        if (e.request.mode === 'navigate') {
          const index = await cache.match('./')
          if (index) return index
        }
        return Response.error()
      }
    })()
  )
})
