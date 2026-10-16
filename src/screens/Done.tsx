import { WeekDots } from '../components/ui'
import { COPY } from '../lib/copy'
import type { Arrival } from '../lib/store'

interface Props {
  count: number
  goal: number
  weekCounts: number[]
  arrival: Arrival | null
  onOneMore: () => void
  onReview: () => void
  onSettings: () => void
}

export function Done({ count, goal, weekCounts, arrival, onOneMore, onReview, onSettings }: Props) {
  return (
    <div class="screen">
      <header class="bar">
        <span class="mode-label">今日</span>
        <div class="bar-right">
          <button class="ghost icon" onClick={onSettings} aria-label="設定">
            ⚙
          </button>
        </div>
      </header>
      <div class="done-phrase fade-in-slow">{COPY.done(count, goal)}</div>
      <p class="done-sub">{COPY.doneSub}</p>
      <WeekDots counts={weekCounts} goal={goal} />
      {arrival && (
        <button class="arrival fade-in" onClick={onReview}>
          {COPY.arrivedBtn(arrival.date, arrival.round)}
        </button>
      )}
      <button class="ghost bonus-btn" onClick={onOneMore}>
        {COPY.oneMore}
      </button>
    </div>
  )
}
