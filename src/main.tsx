import { render } from 'preact'
import { App } from './app'
import './styles.css'

render(<App />, document.getElementById('app')!)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // BASE_URL基準(サブパス配信でも正しいスコープで登録される)
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}
