import { render } from 'preact'
import { App } from './app'
import './styles.css'

render(<App />, document.getElementById('app')!)

// 更新の配送: sw.jsをHTTPキャッシュに通さず、version.jsonで新版を検知して「更新する」を出す
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void (async () => {
      let reg: ServiceWorkerRegistration
      try {
        reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      } catch {
        return
      }
      const announce = () => window.dispatchEvent(new CustomEvent('app:update'))
      if (reg.waiting && navigator.serviceWorker.controller) announce()
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        nw?.addEventListener('statechange', () => {
          if ((nw.state === 'installed' || nw.state === 'activated') && navigator.serviceWorker.controller) announce()
        })
      })
      const check = async () => {
        try {
          const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
          const j = (await r.json()) as { version?: string }
          if (j.version && j.version !== __APP_VERSION__) await reg.update()
        } catch {
          /* オフライン */
        }
      }
      void check()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void check()
      })
    })()
  })
}
