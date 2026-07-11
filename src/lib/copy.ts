// マイクロコピー集(仕様§6が唯一の正)。文言の追加・変更は仕様書§6を先に更新すること。
export const COPY = {
  // 起動時・エディタ内
  oneSentenceDay: '今日は1文だけでいい日',
  oneSentenceDayWhy: '1日の欠けは習慣に響かない。2日目を防ぐことだけが大事',
  stall: '『詰まった』と、そのまま書いていい',
  stallWhy: '手が止まるのは検閲が始まった合図。検閲ごと書けば水路は詰まらない',
  insight: 'どこかに『なぜなら』をひとつ',
  insightWhy: '出来事に理由をつけた日記だけが、思考の訓練になる。アプリは字句を数えるだけで、読んで理解はしない',
  timerEnd: '文の途中でも、そこで終えていい',
  timerEndWhy: '書き切れなさは明日の燃料。ツァイガルニク効果という',
  paste: 'ここは自筆だけ',
  pasteWhy: '自分の語彙から取り出すことだけが、検索の訓練になる',
  backspaceFirst: 'ここでは消せない。誤変換ごと進んでいい',
  backspaceFirstWhy: '消して直すのは推敲の仕事。いまは生成の時間',
  emotionLongPress: '既製の語で足りなければ、作っていい',
  emotionPlaceholder: 'いまの気持ちに、名前をひとつ',
  undoToast: '続きを書く',

  // 画面B・C
  essayPlaceholder: (name: string) => `${name}に、今日の1文`,
  themeContinue: (theme: string) => `先週の続き: ${theme}`,
  themeChange: '変える',
  themeAsk: '今週の『ほんとうのこと』をひとつ',
  recipientAsk: 'これを一番わかってほしい一人は?',
  carryPlaceholder: '明日の自分に、答えを書かずに問いだけ',

  // 完了画面
  donePhraseDefault: '水路、通った',
  closeTalk: '画面を閉じて、いま書いたことを60秒、声で言い直してみる',
  closeTalkSub: '声が出せない場所なら、口だけ動かせばいい',
  closeTalkDone: 'やった',
  week5: '今週の水路は通っていた',
  backupNudge: (days: number | null) => (days === null ? 'バックアップがまだない' : `バックアップは${days}日前`),

  // 再読・推敲・再開
  rereadMark: '自分らしい言い回しがあれば、長押しで2つまで',
  reviseRead: '声に出して、一度だけ通して読む',
  reviseVoiceSub: '声が出せない場所なら、口だけ動かせばいい',
  reviseReadDone: '読んだ',
  reviseTap: '舌が転んだ一文があれば、タップで直せる',
  reviseEditHint: '隣の人に話すなら、どう言う?',
  reviseSummary: '画面を見ずに、30秒で誰かに話すつもりで要約',
  reviseSummaryDone: 'やった',
  archiveAsk: (name: string) => `${name}はこれを読んで、何と返すだろう`,
  restartAsk: '次の月曜から、新しい章を始める?',
  restartGo: '始める',

  // 通知
  notifyBody: (ifThen: string) => `${ifThen}。1行目はもう書いてある`,
  reminderFixed: '水路。1文でもいい',
} as const
