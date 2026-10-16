import { render } from 'preact'
import { App } from './app'
import './styles.css'

render(<App />, document.getElementById('app')!)

/**
 * 更新の配送(§15.12)。GitHub Pagesは index.html と sw.js に max-age=600 を返すため、
 * 既定のままだと更新後10分は古い版が読まれ、ホーム画面アプリでは次の次の起動まで残る。
 * - updateViaCache:'none' で sw.js 自体をHTTPキャッシュに通さない
 * - 起動時・前面復帰時に version.json(no-store)を見て、違えば registration.update()
 * - 新しいSWが有効になったら 'suiro:update' を投げ、UIが「更新する」を出す(勝手にリロードしない)
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void (async () => {
      let reg: ServiceWorkerRegistration
      try {
        reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      } catch {
        return
      }
      const announce = () => window.dispatchEvent(new CustomEvent('suiro:update'))
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
          /* オフライン等 */
        }
      }
      void check()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void check()
      })
    })()
  })
}
