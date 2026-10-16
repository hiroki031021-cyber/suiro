import { useEffect, useRef } from 'preact/hooks'

// §11.2 ノンストップエディタ(多層防御)。v1で3か月実機運用した実装をv3のメモ用に復元。
// 層1: beforeinput の inputType 許可リスト
// 層2: 確定済みプレフィックス照合(自動修正・音声入力の事後置換から復元)
// 層3: autocorrect等のOS機能抑制
// 層4: composition自前フラグ+IME活動タイムスタンプでカーソル末尾強制をガード
//
// 重要: IME変換中・変換確定直後に ta.value への代入や setSelectionRange を行うと、
// WebKit/Chrome は変換をその場で強制キャンセルする(iOSフリックでは同じ文字が二重に入る)。
// そのため選択・値の操作は「復元が必要なときだけ」+「IME活動から一定時間後」に限る。

// insertFromComposition / delete*Composition*: WebKitはcompositionendの後に
// これらのbeforeinputで確定テキストを挿入するため、拒否すると変換確定が捨てられ内部状態がずれる
const ALLOWED_INPUT = new Set([
  'insertText',
  'insertCompositionText',
  'insertFromComposition',
  'deleteByComposition',
  'deleteCompositionText',
  'insertLineBreak',
  'insertParagraph',
])
const BLOCKED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'])

/** IME活動からこの時間内は選択位置に一切触らない(変換キャンセル防止) */
const IME_GRACE_MS = 250

export interface EditorApi {
  /** composition中でも現在の値を返す(確定待ちレース対策) */
  getValue: () => string
  /** 値をプログラムから設定(題をもらう等)。IME変換中はfalseを返して何もしない */
  setValue: (text: string) => boolean
  focus: () => void
  blur: () => void
}

interface Props {
  initial: string
  placeholder: string
  /** 行数の上限(題1行+本文6行=7)。超える改行は拒否する */
  maxLines: number
  disabled?: boolean
  onChange: (text: string) => void
  onBlockedDelete: () => void
  onBlockedPaste: () => void
  onLineLimit?: () => void
  register?: (api: EditorApi) => void
}

export function NonstopEditor({
  initial,
  placeholder,
  maxLines,
  disabled,
  onChange,
  onBlockedDelete,
  onBlockedPaste,
  onLineLimit,
  register,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const committed = useRef(initial)
  const composing = useRef(false)
  const lastIme = useRef(0)

  const markIme = () => {
    lastIme.current = Date.now()
  }
  const imeQuiet = () => !composing.current && Date.now() - lastIme.current >= IME_GRACE_MS

  const toEnd = () => {
    const ta = ref.current
    if (!ta) return
    const n = ta.value.length
    if (ta.selectionStart !== n || ta.selectionEnd !== n) ta.setSelectionRange(n, n)
  }

  const grow = () => {
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(ta.scrollHeight, 200)}px`
  }

  const lineCount = (v: string) => v.split('\n').length

  const reconcile = () => {
    const ta = ref.current
    if (!ta || composing.current) return
    const v = ta.value
    if (v.startsWith(committed.current) && lineCount(v) <= maxLines) {
      // 末尾に増えただけ: 選択位置には触らない(変換確定直後に触ると確定が壊れる)
      if (v !== committed.current) {
        committed.current = v
        onChange(v)
      }
      grow()
    } else {
      // 確定済み領域が破壊された(QuickTypeの事後置換・音声入力の差し替え等)または行数超過 → 復元
      ta.value = committed.current
      onChange(committed.current)
      grow()
      toEnd()
    }
  }

  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    register?.({
      getValue: () => ref.current?.value ?? committed.current,
      setValue: (t: string) => {
        const el = ref.current
        if (!el || !imeQuiet()) return false
        committed.current = t
        el.value = t
        onChange(t)
        grow()
        toEnd()
        return true
      },
      focus: () => ref.current?.focus(),
      blur: () => ref.current?.blur(),
    })
    ta.value = committed.current
    // OSの事後置換を抑制(§11.2 層3)
    ta.setAttribute('autocorrect', 'off')
    ta.setAttribute('autocapitalize', 'none')
    ta.setAttribute('spellcheck', 'false')
    grow()
    const onSel = () => {
      // IME変換中(および直後)の選択変化はIME自身のもの — 触ると変換が壊れる
      if (!imeQuiet()) return
      if (document.activeElement === ta) toEnd()
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  useEffect(() => {
    if (ref.current) ref.current.disabled = !!disabled
  }, [disabled])

  return (
    <textarea
      ref={ref}
      class="editor memo-editor"
      placeholder={placeholder}
      rows={7}
      enterkeyhint="enter"
      onCompositionStart={() => {
        composing.current = true
        markIme()
      }}
      onCompositionUpdate={markIme}
      onCompositionEnd={() => {
        composing.current = false
        markIme()
        // WebKitはこの後に insertFromComposition の beforeinput/input が来る。
        // 即時に照合すると確定挿入と競合するため、少し待ってから照合する
        setTimeout(() => {
          markIme()
          reconcile()
        }, 30)
      }}
      onBeforeInput={(e: any) => {
        const t: string = e.inputType ?? ''
        if (composing.current || e.isComposing) {
          markIme()
          // IME内部の編集(変換中の削除・候補選択)は素通し。貼り付けだけは常に拒否
          if (t === 'insertFromPaste' || t === 'insertFromDrop') e.preventDefault()
          return
        }
        if (t === 'insertLineBreak' || t === 'insertParagraph') {
          const ta = ref.current
          if (ta && lineCount(ta.value) >= maxLines) {
            e.preventDefault()
            onLineLimit?.()
          }
          return
        }
        if (ALLOWED_INPUT.has(t)) {
          if (t === 'insertCompositionText' || t === 'insertFromComposition') markIme()
          return
        }
        e.preventDefault()
        if (t.startsWith('delete')) onBlockedDelete()
        else if (t === 'insertFromPaste' || t === 'insertFromDrop') onBlockedPaste()
      }}
      onKeyDown={(e) => {
        if (composing.current || e.isComposing || e.keyCode === 229) {
          markIme()
          return
        }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault()
          onBlockedDelete()
          return
        }
        if (BLOCKED_KEYS.has(e.key)) {
          e.preventDefault()
          return
        }
        if ((e.metaKey || e.ctrlKey) && ['a', 'z', 'x', 'v'].includes(e.key.toLowerCase())) {
          e.preventDefault()
          if (e.key.toLowerCase() === 'v') onBlockedPaste()
        }
      }}
      onInput={(e: any) => {
        if (e.isComposing || composing.current) {
          // 変換中の入力には一切干渉しない
          markIme()
          return
        }
        reconcile()
      }}
      onPaste={(e) => {
        e.preventDefault()
        onBlockedPaste()
      }}
      onCut={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    />
  )
}
