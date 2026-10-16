import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }
let sha = 'dev'
try {
  sha = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  /* gitなし */
}

export default defineConfig({
  // GitHub Pagesのサブパス(/suiro/)配信に対応するため相対ベース
  base: './',
  plugins: [preact()],
  // 設定画面に出すビルド番号(実機でどの版が動いているかを確認するため §15.11)
  define: { __APP_VERSION__: JSON.stringify(`${pkg.version}+${sha}`) },
})
