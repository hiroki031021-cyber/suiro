// 意味・感情・質の分析はしない。行うのは機械的な字句一致のみ(§10.0)
const INSIGHT_WORDS = ['なぜなら', 'だから', 'というのは', '気づいた', '気付いた', 'わかった', '分かった', '要するに', 'つまり']

export function hasInsightWord(text: string): boolean {
  return INSIGHT_WORDS.some((w) => text.includes(w))
}

/** 完了条件: 句点1つ or 20字以上(§7.1) */
export function meetsCompletion(text: string): boolean {
  return /[。.!?!?]/.test(text) || text.replace(/\s/g, '').length >= 20
}
