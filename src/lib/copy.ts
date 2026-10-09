// マイクロコピー集(仕様§6・§14.8が唯一の正)。文言の追加・変更は仕様書を先に更新すること。
export const COPY = {
  // 起動時・セッション内(§14.2)
  oneSentenceDay: '今日は①②だけでいい日',
  oneSentenceDayWhy: '1日の欠けは習慣に響かない。2日目を防ぐことだけが大事',
  timerEnd: '時間。文の途中でも、次へ進んでいい',
  timerEndWhy: '15分は上限であって目標ではない。書き切れなさは明日の燃料',
  noteNext: '次へ',
  noteFinish: '終わる',
  undoToast: '続きを書く',
  carryLine: (h: string) => `昨日の仮説 ─ ${h}`,

  // 五つの段(§14.2)
  steps: [
    { label: 'コンテンツ', q: '今日、目に触れたもの・経験したものを一つ', ph: '本・会話・景色・失敗、なんでもいい' },
    { label: '気づき', q: '①について、自分で気づいたことを一つ', ph: '最悪、感想でもいい' },
    { label: 'ストーリー', q: '②と結びつく、自分の過去の経験', ph: 'いつ・どこで・何があったか' },
    { label: '根拠', q: '②は一般にも当てはまるか。根拠・反例、または法則', ph: '知っている法則・データ・反対の例' },
    { label: '行動', q: '①〜④を踏まえて、今後どう生かすか', ph: '次に、いつ・何をするか' },
  ] as const,
  diffHint: '感想(良かった)ではなく、差分(予想と違った点)',
  diffHintWhy: '鋭い気づきの正体は、ほぼ予想とのズレ。感想は誰が書いても同じ形になる',
  tagGround: '根拠',
  tagCounter: '反例',
  tagHypothesis: '仮説',
  tagAsk: 'これは、どれ?',
  hypothesisNote: '明日の①の上に戻ってくる',
  counterNote: '当てはまらない場所が分かると、気づきの輪郭が出る',

  // 完了画面(§14.3)
  donePhraseDefault: '水路、通った',
  closeTalk: '画面を閉じて、①〜⑤を60秒、誰かに話すつもりで声に出す',
  closeTalkSub: '声が出せない場所なら、口だけ動かせばいい',
  closeTalkDone: 'やった',
  week5: '今週の水路は通っていた',
  backupNudge: (days: number | null) => (days === null ? 'バックアップがまだない' : `バックアップは${days}日前`),

  // 日曜の選び直し(§14.4)
  reviewHint: '今週の気づき。一つ選んで、60秒で話す',
  reviewEmpty: '今週の気づきはまだない',
  reviewTalk: '60秒で話す',
  reviewTalkSub: '①〜⑤を台本に。読み上げではなく、話し言葉で作り直す',
  reviewDone: '今日はここまで',

  // 再開
  restartAsk: '次の月曜から、新しい章を始める?',
  restartGo: '始める',

  // タイムカプセル(§3.4、v1の日記が届く間だけ)
  capsuleArrived: '30日前の週の日記が届いている',
  capsuleOpen: '開ける',
  capsuleDiscard: '開けずに流す',
  capsuleWordsTitle: '繰り返し出ていた語',
  capsuleReadBody: '本文を読む',
  capsuleWhy: '30日前が最悪の週だった人に、起動しただけで当時の排水を突きつけない。読む・流す・置いておくは、全部正しい',

  // 定点観測(§3.6 + §14.5)
  ckPrompt: '最近考えていることを、1分で',
  ckStart: '録音をはじめる',
  ckFallback: 'マイクなしで、タイマーだけで話す',
  ckCounting: '一度だけ聴き返して、3つ数える(内容の良し悪しは聞かない)',
  ckWords: 'おおよその語数',
  ckFillers: '「えー・あの」の回数',
  ckSilences: '2秒以上の沈黙の回数',
  ckSave: '保存して終わる',
  ckPrevTalk: (n: number) => `先月の声出し ${n}回`,
  ckHypo: (h: number, n: number) => `仮説率 ${n === 0 ? '—' : `${Math.round((h / n) * 100)}%`}(${h}/${n})`,
  ckHypoWhy: '④で「仮説」を選んだ割合。下がれば、根拠か反例をその場で出せる日が増えたということ',

  // 通知
  notifyBody: (ifThen: string) => `${ifThen}。①は、今日目に触れたもの一つ`,
  reminderFixed: '水路。①だけでもいい',
} as const
