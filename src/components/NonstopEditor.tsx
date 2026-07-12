import { useEffect, useRef } from 'preact/hooks'

// §11.2 ノンストップエディタ(多層防御)
// 層1: beforeinput の inputType 許可リスト
// 層2: 確定済みプレフィックス照合(自動修正・音声入力の事後置換から復元)
// 層3: autocorrect等のOS機能抑制
// 層4: composition自前フラグ+IME活動タイムスタンプでカーソル末尾強制をガード
//
// 重要: IME変換中・変換確定直後に ta.value への代入や setSelectionRange を行うと、
// WebKit/Chrome は変換をその場で強制キャンセルする(ローマ字が生のまま残る)。
// そのため選択・値の操作は「復元が必要なときだけ」+「IME活動から一定時間後」に限る。

// insertFromComposition / delete*Composition*: WebKitはcompositionendの後に
// これらのbeforeinputで確定テキストを挿入するため、拒否すると変換確定が捨てられる
const ALLOWED_INPUT = new Set([
  'insertText',
  'insertCompositionText',
  'insertFromComposition',
  'deleteByComposition',
  'deleteCompositionText',
  'insertLineBreak',
  'insertParagraph',
])
const BLOCKED_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

/** IME活動からこの時間内は選択位置に一切触らない(変換キャンセル防止) */
const IME_GRACE_MS = 250

export interface EditorApi {
  /** composition中でも現在のtextarea値を返す(確定待ちレース対策) */
  getValue: () => string
  /** 末尾に文字列を挿入(言い換えボタン §2.4)。IME変換中はfalseを返して何もしない */
  append: (text: string) => boolean
  /** 直近のappendを取り消す(挿入後5秒以内・追加入力なしの場合のみ) */
  undoAppend: () => void
}

interface Props {
  initial: string
  placeholder: string
  onChange: (text: string) => void
  onActivity: () => void
  onBlockedDelete: () => void
  onBlockedPaste: () => void
  register?: (api: EditorApi) => void
}

export function NonstopEditor({
  initial,
  placeholder,
  onChange,
  onActivity,
  onBlockedDelete,
  onBlockedPaste,
  register,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const committed = useRef(initial)
  const composing = useRef(false)
  const lastIme = useRef(0)
  const lastAppend = useRef<{ prev: string; inserted: string; at: number } | null>(null)

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
    ta.style.height = `${Math.max(ta.scrollHeight, 160)}px`
  }

  const reconcile = () => {
    const ta = ref.current
    if (!ta || composing.current) return
    const v = ta.value
    if (v.startsWith(committed.current)) {
      // 末尾に増えただけ: 選択位置には触らない(変換確定直後に触ると確定が壊れる)
      if (v !== committed.current) {
        committed.current = v
        onChange(v)
      }
      grow()
    } else {
      // 確定済み領域が破壊された(QuickTypeの事後置換・音声入力の差し替え等)→ 復元
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
      append: (t: string) => {
        const el = ref.current
        if (!el || composing.current || Date.now() - lastIme.current < IME_GRACE_MS) return false
        const prev = committed.current
        committed.current = prev + t
        el.value = committed.current
        lastAppend.current = { prev, inserted: t, at: Date.now() }
        onChange(committed.current)
        grow()
        toEnd()
        el.focus()
        return true
      },
      undoAppend: () => {
        const el = ref.current
        const la = lastAppend.current
        if (!el || !la || composing.current) return
        if (Date.now() - la.at > 5000) return
        // 挿入後に何か入力されていたら取り消さない(文中スプライスをしない)
        if (committed.current !== la.prev + la.inserted) return
        committed.current = la.prev
        el.value = la.prev
        lastAppend.current = null
        onChange(la.prev)
        grow()
        toEnd()
      },
    })
    ta.value = committed.current
    // OSの事後置換を抑制(§11.2 層3)
    ta.setAttribute('autocorrect', 'off')
    ta.setAttribute('autocapitalize', 'none')
    ta.setAttribute('spellcheck', 'false')
    grow()
    ta.focus()
    toEnd()
    const onSel = () => {
      // IME変換中(および直後)の選択変化はIME自身のもの — 触ると変換が壊れる
      if (!imeQuiet()) return
      if (document.activeElement === ta) toEnd()
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  return (
    <textarea
      ref={ref}
      class="editor"
      placeholder={placeholder}
      rows={6}
      onCompositionStart={() => {
        composing.current = true
        markIme()
        onActivity()
      }}
      onCompositionUpdate={() => {
        markIme()
        onActivity()
      }}
      onCompositionEnd={() => {
        composing.current = false
        markIme()
        onActivity()
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
        onActivity()
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
