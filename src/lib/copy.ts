// マイクロコピー集(仕様§15.8が唯一の正)。文言の追加・変更は仕様書を先に更新すること。
export const COPY = {
  // 起動時・セッション共通
  oneSentenceDay: '今日はメモ2枚だけでいい日',
  oneSentenceDayWhy: '1日の欠けは習慣に響かない。2日目を防ぐことだけが大事',
  timerEnd: '時間。文の途中でも、次へ進んでいい',
  noteNext: '次へ',
  noteFinish: '終わる',
  undoToast: '続きを書く',

  // ゼロ秒メモ(§15.2)
  memoLabel: 'メモ',
  memoPh: '1行目に題(頭に浮かんだ問い・引っかかり)\n2行目から本文。1行1文、20〜30字、6行まで',
  memoLineLimit: '6行で満了。次の1枚へ',
  memoEmptyFrozen: '本文がないまま1分。この紙はやり直せる',
  memoRedo: 'やり直す',
  memoGetTitle: '題をもらう',
  memoFrozen: '1分。次の1枚へ',
  memoFrozenLast: '1分。5枚そろった',
  memoNext: '次の1枚',
  memoToIssue: 'イシューを選ぶ',
  memoStartHint: '書き始めた瞬間から60秒。消せない、戻れない',
  memoStartHintWhy: 'うまく書こうとした瞬間に手が止まる。粗くていいから出し切る。量が瞬発力をつくる',
  memoNoDelete: 'ここでは消せない。誤変換ごと進んでいい',
  memoPaste: 'ここは自筆だけ',
  carryLine: (q: string) => `昨日のイシュー ─ ${q}`,
  carryUse: '続きを掘る',

  // イシューを選ぶ(§15.3)
  issueLabel: 'イシュー',
  issuePick: '5枚のうち、答えが出ると何かが変わる問いはどれか',
  issueOther: 'どれでもない。新しく書く',
  issueAsk: '「〜ではないか」の形に言い直す。主語と動詞を入れる',
  issuePh: '〜は、〜ではないか',
  issueEndHint: '語尾は「か」で終える。スタンスを取る',
  issueEndHintWhy: '「〜について」は問いではない。答えが出る形にしてはじめて、答えが出せる',
  condAsk: 'イシュー度',
  condPivotal: '答えが出ると何かが変わる',
  condDeep: '常識と違う見立て',
  condAnswerable: '今の自分に答えを出せる',
  condYes: '○',
  condNo: '△',
  condLowHint: 'このまま進んでいい。イシュー度は日曜に比べる',

  // 空・雨・傘(§15.4)
  skyLabel: '空',
  rainLabel: '雨',
  umbrellaLabel: '傘',
  skyQ: '確かに言える事実は何か。自分の経験・数字・反例も',
  skyPh: '見たこと、起きたこと、数えられること',
  rainQ: 'だから何が言えるか(So what?)。イシューへの今の答え',
  rainPh: '〜ということだ',
  umbrellaQ: '雨が正しいなら、次に何をするか',
  umbrellaPh: 'いつ・何を',

  // つなぎ(§15.5)
  linkLabel: 'つなぎ',
  linkQ: '空から雨、雨から傘へ、つながっているか',
  linkSR: '雨は空から言えるか',
  linkRU: '傘は雨から導けるか',
  linkOk: 'つながる',
  linkGap: 'ずれ',
  gapNote: 'ずれは失敗ではなく、空か雨のどちらかが足りない印',
  gapNoteWhy: 'ずれた対が分かれば、次に足すのは事実か解釈かが決まる。アプリは押された印を数えるだけで、本文は読まない',

  // 完了画面(§15.6)
  donePhraseDefault: '水路、通った',
  closeTalk: '画面を閉じて、イシューと傘だけを20秒で声に出す',
  closeTalkSub: 'エレベーターテスト。声が出せない場所なら、口だけ動かせばいい',
  closeTalkDone: 'やった',
  week5: '今週の水路は通っていた',
  backupNudge: (days: number | null) => (days === null ? 'バックアップがまだない' : `バックアップは${days}日前`),

  // 日曜の棚卸し(§15.7)
  reviewHint: '今週のイシュー。答えが出ると一番変わるものを、一つ選ぶ',
  reviewEmpty: '今週のイシューはまだない',
  reviewTalk: '20秒で話す',
  reviewTalkSub: 'イシュー、雨、傘の順に。読み上げではなく、話し言葉で',
  reviewDone: '今日はここまで',
  bagArrived: '90日前の週のメモが届いている',
  bagOpen: '開ける',
  bagDiscard: '開けずに流す',
  bagWhy: 'ゼロ秒思考の袋詰め。書いた直後に読み返すと手が止まる。3か月後なら、他人の文章として読める',

  // 再開
  restartAsk: '次の月曜から、新しい章を始める?',
  restartGo: '始める',

  // タイムカプセル(§3.4、v1の日記が届く間だけ)
  capsuleArrived: '30日前の週の日記が届いている',
  capsuleOpen: '開ける',
  capsuleDiscard: '開けずに流す',
  capsuleWordsTitle: '繰り返し出ていた語',
  capsuleReadBody: '本文を読む',

  // 定点観測(§3.6 + §15.6)
  ckPrompt: '最近考えていることを、1分で',
  ckStart: '録音をはじめる',
  ckFallback: 'マイクなしで、タイマーだけで話す',
  ckCounting: '一度だけ聴き返して、3つ数える(内容の良し悪しは聞かない)',
  ckWords: 'おおよその語数',
  ckFillers: '「えー・あの」の回数',
  ckSilences: '2秒以上の沈黙の回数',
  ckSave: '保存して終わる',
  ckPrevTalk: (n: number) => `先月の声出し ${n}回`,
  ckIssue: (f: number, n: number) => `三つ○のイシュー ${f}/${n}本`,
  ckIssueWhy: '3条件がそろったイシューの数。増えれば、解く前に問いを選べている',
  ckGaps: (g: number, n: number) => `ずれ ${g}/${n}日`,
  ckGapsWhy: 'つなぎで一つでも「ずれ」を押した日の数。減れば、事実から解釈、解釈から行動へ無理なく組めている',

  // 通知
  notifyBody: (ifThen: string) => `${ifThen}。1枚目の題は、いま気になっていること`,
  reminderFixed: '水路。メモ1枚でもいい',
} as const
