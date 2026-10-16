// service worker — コアをプリキャッシュ+ネットワーク優先/キャッシュフォールバック。
// GitHub Pagesはmax-age=600を返すため、index/プリキャッシュはHTTPキャッシュを通さない。
const CACHE = 'zerobyo-v1'
const CORE = ['./', './manifest.webmanifest', './icon.svg', './icon-512.png', './apple-touch-icon.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await Promise.all(CORE.map((u) => cache.add(new Request(u, { cache: 'reload' }))))
      try {
        const res = await cache.match('./')
        if (res) {
          const html = await res.text()
          const assets = [...html.matchAll(/(?:\.\/)?assets\/[^"' )]+/g)].map((m) => new URL(m[0], self.location.href).href)
          if (assets.length) await cache.addAll([...new Set(assets)])
        }
      } catch {
        /* 2回目以降のfetchで埋まる */
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
  if (url.pathname.endsWith('/version.json')) return // 更新検知は常に素通し
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
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
