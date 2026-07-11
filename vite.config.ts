import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  // GitHub Pagesのサブパス(/suiro/)配信に対応するため相対ベース
  base: './',
  plugins: [preact()],
})
