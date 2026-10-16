import { useState } from 'preact/hooks'

const IF_THEN_PRESETS = [
  '朝のコーヒーを淹れたら',
  '歯を磨いたら',
  '最初の会議の10分前になったら',
  '寝る前にベッドに入ったら',
]

interface Props {
  onDone: (ifThenText: string, notifyTime: string) => void
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
  )
}

export function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(1)
  const [ifThen, setIfThen] = useState('')
  const [time, setTime] = useState('21:00')

  const finish = () => {
    if ('Notification' in window && Notification.permission === 'default' && isStandalone()) {
      void Notification.requestPermission().finally(() => onDone(ifThen || IF_THEN_PRESETS[0], time))
    } else {
      onDone(ifThen || IF_THEN_PRESETS[0], time)
    }
  }

  if (step === 1) {
    return (
      <div class="screen center onboarding">
        <div class="ob-mark">水路</div>
        <p class="ob-lead">
          1日15分。
          <br />
          1分1枚のメモを5枚、消さずに書き切る。
          <br />
          そこからイシューを一つ選び、
          <br />
          空・雨・傘で組み立て、20秒で声に出す。
        </p>
        <p class="ob-lead sub">このアプリは、書いたものを外に送らない。</p>
        <button class="primary big" onClick={() => setStep(2)}>
          次へ
        </button>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div class="screen onboarding">
        <div class="mode-label">はじめの設定</div>
        <label class="field-label">「(いつ・何をしたら)、書く」の穴埋めをひとつ</label>
        <div class="chips">
          {IF_THEN_PRESETS.map((p) => (
            <button key={p} class="chip" onClick={() => setIfThen(p)}>
              {p}
            </button>
          ))}
        </div>
        <input
          class="text-input"
          value={ifThen}
          placeholder="自由に書いてもいい"
          onInput={(e: any) => setIfThen(e.currentTarget.value)}
        />
        <label class="field-label">それは大体何時?</label>
        <input class="text-input" type="time" value={time} onInput={(e: any) => setTime(e.currentTarget.value)} />
        <button class="primary" disabled={!ifThen.trim()} onClick={() => (isStandalone() ? finish() : setStep(3))}>
          次へ
        </button>
      </div>
    )
  }

  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  return (
    <div class="screen onboarding">
      <div class="mode-label">ホーム画面に追加</div>
      <p class="ob-lead">
        毎日1タップで開くために、そしてデータが消えないために、ホーム画面への追加がほぼ必須です。
      </p>
      {ios ? (
        <ol class="ob-steps">
          <li>Safariの共有ボタン(□に↑)を押す</li>
          <li>「ホーム画面に追加」を選ぶ</li>
          <li>以後はホームの「水路」から開く</li>
        </ol>
      ) : (
        <ol class="ob-steps">
          <li>アドレスバー右の「インストール」アイコンを押す</li>
          <li>(なければブラウザメニューから「アプリをインストール」)</li>
        </ol>
      )}
      <div class="stack">
        <button class="primary" onClick={finish}>
          追加した
        </button>
        <button class="ghost" onClick={finish}>
          あとで
        </button>
      </div>
    </div>
  )
}
