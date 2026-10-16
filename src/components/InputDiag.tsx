import { useRef, useState } from 'preact/hooks'

/**
 * 入力の診断(§15.11): 実機で何のイベントが来ているかを画面に出す。
 * 制約なしの素のtextareaに、beforeinput/input/compositionの直近12件を記録する。
 */
export function InputDiag() {
  const [log, setLog] = useState<string[]>([])
  const seq = useRef(0)
  const push = (line: string) => {
    seq.current++
    setLog((l) => [`${seq.current}. ${line}`, ...l].slice(0, 12))
  }
  const fmt = (e: any) =>
    `${e.type} type=${e.inputType ?? '-'} comp=${e.isComposing ? 1 : 0} data=${JSON.stringify(e.data ?? null)}`
  return (
    <div class="diag">
      <textarea
        class="text-input"
        rows={2}
        placeholder="ここに「ど」と打つ"
        onBeforeInput={(e: any) => push(fmt(e))}
        onInput={(e: any) => push(`${fmt(e)} value=${JSON.stringify((e.currentTarget as HTMLTextAreaElement).value)}`)}
        onCompositionStart={(e: any) => push(`compositionstart data=${JSON.stringify(e.data)}`)}
        onCompositionUpdate={(e: any) => push(`compositionupdate data=${JSON.stringify(e.data)}`)}
        onCompositionEnd={(e: any) => push(`compositionend data=${JSON.stringify(e.data)}`)}
        onKeyDown={(e: any) => push(`keydown key=${e.key} code=${e.keyCode} comp=${e.isComposing ? 1 : 0}`)}
      />
      <pre class="diag-log">{log.join('\n') || '(まだ何も来ていない)'}</pre>
      <p class="note">UA: {navigator.userAgent}</p>
    </div>
  )
}
