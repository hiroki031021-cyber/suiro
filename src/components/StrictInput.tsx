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

/**
 * ゼロ秒メモの1行(§15.2): 削除・カーソル移動・貼り付け不可。Enterで行を確定。
 * IME変換中の削除・候補確定は妨げない(isComposing)。
 */
export function StrictInput(props: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const composing = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    props.register?.(el)
    if (props.autoFocus) el.focus()
  }, [])

  return (
    <input
      ref={ref}
      class="memo-line"
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      autocapitalize="none"
      autocomplete="off"
      autocorrect="off"
      spellcheck={false}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
      }}
      onBeforeInput={(e: InputEvent) => {
        if (e.isComposing || composing.current) return
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
        if (e.isComposing || e.keyCode === 229) return
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
        const el = e.currentTarget as HTMLInputElement
        // 末尾以外への入力・選択置換を潰す(カーソルは常に末尾)
        if (el.selectionStart !== el.value.length) el.setSelectionRange(el.value.length, el.value.length)
        props.onChange(el.value)
      }}
      onSelect={(e) => {
        const el = e.currentTarget as HTMLInputElement
        if (!composing.current && el.selectionStart !== el.value.length)
          el.setSelectionRange(el.value.length, el.value.length)
      }}
    />
  )
}
