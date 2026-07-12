import { STOPWORDS } from '../data/stopwords'

// 頻出語の抽出(§10.0の境界: 機械的な字句カウントのみ。意味の理解はしない)
// Intl.Segmenterが無い環境では黙って空を返す(反芻検出・カプセル頻出語が無効になるだけ)

const HAS_SEGMENTER = typeof Intl !== 'undefined' && 'Segmenter' in Intl

/** 漢字・カタカナを含む2文字以上の語の頻度上位を返す */
export function extractKeywords(text: string, top = 5): string[] {
  if (!HAS_SEGMENTER || !text) return []
  const seg = new Intl.Segmenter('ja', { granularity: 'word' })
  const freq = new Map<string, number>()
  for (const s of seg.segment(text)) {
    const w = s.segment
    if (!s.isWordLike || w.length < 2) continue
    if (!/[々一-鿿゠-ヿ]/.test(w)) continue
    if (STOPWORDS.includes(w)) continue
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([w]) => w)
}
