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
  closeTalkTo: (name: string) => `画面を閉じて、いま書いたことを${name}に60秒で言い直してみる`,
  closeTalkTwice: '同じことを30秒。それから、べつの言い方でもう30秒',
  closeTalkSub: '声が出せない場所なら、口だけ動かせばいい',
  closeTalkDone: 'やった',
  phraseLine: (p: string) => `ついでに、この言い回しをひとつ混ぜてみる ─ 『${p}』`,
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

  // 反芻検出(停止検出の一言の差し替え §10.2)
  rumination: '今日は、別の場所を掘っていい',
  ruminationWhy: '同じ話題が3日続いて、新しい「なぜなら」が出ていない。アプリは字句を数えただけで、読んではいない',

  // 言い換え(§2.4)・重い日(§2.3)
  rephraseInsert: 'いや、正確には…',
  rephraseUndo: '取り消す',
  heavyToggle: '重い日',
  heavyPlaceholder: (name: string) => `${name || '(名前)'}は今日、`,

  // タイムカプセル(§3.4)
  capsuleArrived: '30日前の週の日記が届いている',
  capsuleOpen: '開ける',
  capsuleDiscard: '開けずに流す',
  capsuleWordsTitle: '繰り返し出ていた語',
  capsuleReadBody: '本文を読む',
  capsulePhraseAsk: '会話で使えそうな言い回しがあれば1つ、フレーズ帳へ',
  capsuleWhy: '30日前が最悪の週だった人に、起動しただけで当時の排水を突きつけない。読む・流す・置いておくは、全部正しい',

  // 定点観測(§3.6)
  ckPrompt: '最近考えていることを、1分で',
  ckStart: '録音をはじめる',
  ckFallback: 'マイクなしで、タイマーだけで話す',
  ckCounting: '一度だけ聴き返して、3つ数える(内容の良し悪しは聞かない)',
  ckWords: 'おおよその語数',
  ckFillers: '「えー・あの」の回数',
  ckSilences: '2秒以上の沈黙の回数',
  ckSave: '保存して終わる',
  ckPrevTalk: (n: number) => `先月の声出し ${n}回`,
  ckRetry: 'もう一度',

  // 言えなかったことインボックス
  captureTitle: '言えなかったことを、次はこう言う',
  capturePlaceholder: '「次はこう言う」の一言だけ',
  captureSave: '明日の1行目に出す',
  inboxQuestion: (t: string) => `『${t}』─ 次は、どこで言う?`,

  // 問いガイド(§3.2)
  digNext: '次へ',
  digFinish: '終わる',

  // 推敲(宛先で話す)
  reviseSummaryToName: (name: string) => `画面を見ずに、30秒で${name}に話すつもりで要約`,

  // 通知
  notifyBody: (ifThen: string) => `${ifThen}。1行目はもう書いてある`,
  reminderFixed: '水路。1文でもいい',
} as const
