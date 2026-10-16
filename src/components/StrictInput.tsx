import { useEffect, useRef } from 'preact/hooks'

interface Props {
  value: string
  placeholder: string
  disabled?: boolean
  autoFocus?: boolean
  onChange: (v: string) => void
  onEnter: () => void
  onBlockedDelete?: () => void
  onBlockedPaste?: () => void
  register?: (el: HTMLInputElement) => void
}

/** IME活動からこの時間内は値・選択位置に一切触らない(変換キャンセル・二重入力防止) */
const IME_GRACE_MS = 300

/**
 * ゼロ秒メモの1行(§15.2): 削除・カーソル移動・貼り付け不可。Enterで行を確定。
 *
 * 重要(v1 §11.2で学んだこと): IME変換中・変換確定直後に value への代入や
 * setSelectionRange を行うと、iOS/WebKit は変換を強制キャンセルして
 * 同じ文字を二重に入れる。そのため:
 * - 入力欄は非制御(valueプロパティで毎描画上書きしない)
 * - 選択位置の末尾強制は、input中ではなくタップ/選択時だけ、かつIME静止後にのみ行う
 * - プログラムからの値設定(題をもらう等)もIME静止時のみ
 */
export function StrictInput(props: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const lastIme = useRef(0)
  const markIme = () => {
    lastIme.current = Date.now()
  }
  const imeQuiet = () => !composing.current && Date.now() - lastIme.current >= IME_GRACE_MS

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.value = props.value
    props.register?.(el)
    if (props.autoFocus) el.focus()
  }, [])

  // 親からの値変更(題をもらう・昨日のイシュー)。IME静止時のみ反映する
  useEffect(() => {
    const el = ref.current
    if (!el || el.value === props.value) return
    if (imeQuiet()) el.value = props.value
  }, [props.value])

  const toEnd = () => {
    const el = ref.current
    if (!el || !imeQuiet()) return
    const n = el.value.length
    if (el.selectionStart !== n || el.selectionEnd !== n) el.setSelectionRange(n, n)
  }

  return (
    <input
      ref={ref}
      class="memo-line"
      placeholder={props.placeholder}
      disabled={props.disabled}
      autocapitalize="none"
      autocomplete="off"
      autocorrect="off"
      spellcheck={false}
      onCompositionStart={() => {
        composing.current = true
        markIme()
      }}
      onCompositionUpdate={markIme}
      onCompositionEnd={() => {
        composing.current = false
        markIme()
      }}
      onBeforeInput={(e: InputEvent) => {
        if (e.isComposing || composing.current) {
          markIme()
          return
        }
        const t = e.inputType
        if (t.startsWith('delete')) {
          e.preventDefault()
          props.onBlockedDelete?.()
        } else if (t === 'insertFromPaste' || t === 'insertFromDrop') {
          e.preventDefault()
          props.onBlockedPaste?.()
        }
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.isComposing || e.keyCode === 229) {
          markIme()
          return
        }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
          e.preventDefault()
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          props.onEnter()
        }
      }}
      onInput={(e) => {
        const ev = e as InputEvent
        if (ev.isComposing || composing.current) markIme()
        // ここでは値にも選択位置にも触らない(IME二重入力の原因)
        props.onChange((e.currentTarget as HTMLInputElement).value)
      }}
      onPointerUp={() => {
        // タップでの途中挿入だけを、IMEが静かなときに末尾へ戻す
        window.setTimeout(toEnd, 0)
      }}
      onFocus={() => window.setTimeout(toEnd, 0)}
    />
  )
}
