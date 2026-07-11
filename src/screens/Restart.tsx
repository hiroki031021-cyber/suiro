import { COPY } from '../lib/copy'

/** 3日以上空いたとき(§7.4): 空白は見せない。反省文の入力欄も作らない */
export function Restart({ onGo }: { onGo: () => void }) {
  return (
    <div class="screen center">
      <p class="restart-ask">{COPY.restartAsk}</p>
      <button class="primary big" onClick={onGo}>
        {COPY.restartGo}
      </button>
    </div>
  )
}
