import { useEffect, useRef } from 'preact/hooks'

interface Props {
  initial: string
  placeholder: string
  onChange: (text: string) => void
  autoFocus?: boolean
}

/**
 * 五つの段のエディタ(§14.2)。v1の排水エディタと違い、項目内の削除・言い直しは自由。
 * レールは「前の段に戻れない」だけ(画面側で担う)。高さは内容に合わせて伸びる。
 */
export function PlainEditor({ initial, placeholder, onChange, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const grow = () => {
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(ta.scrollHeight, 160)}px`
  }

  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.value = initial
    grow()
    if (autoFocus) {
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length)
    }
  }, [])

  return (
    <textarea
      ref={ref}
      class="editor"
      placeholder={placeholder}
      rows={5}
      autocapitalize="none"
      onInput={(e) => {
        grow()
        onChange((e.currentTarget as HTMLTextAreaElement).value)
      }}
    />
  )
}
