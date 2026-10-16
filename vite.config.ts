import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }
let sha = 'dev'
try {
  sha = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  /* gitなし */
}
const APP_VERSION = `${pkg.version}+${sha}`

export default defineConfig({
  base: './', // GitHub Pagesのサブパス配信
  plugins: [
    preact(),
    {
      // 更新検知用。アプリは起動時にこれをno-storeで読み、自分のビルド番号と比べる
      name: 'version-json',
      closeBundle() {
        mkdirSync('dist', { recursive: true })
        writeFileSync('dist/version.json', JSON.stringify({ version: APP_VERSION }))
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
})
