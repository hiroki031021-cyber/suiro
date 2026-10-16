export const COPY = {
  appName: '水路',
  // はじめの1枚
  introLead: ['1分で1枚。1日10枚。', '左上に題、本文は4〜6行、1行は20〜30字。', '考え込まない。浮かんだ順に書く。きれいに書かない。', '書いた紙は読み返さない。3か月後に届く。'],
  introStart: '1枚目を書く',
  // 紙
  titlePh: '題。頭に浮かんだことを、そのまま',
  bodyPh: '本文。1行1文、4〜6行',
  getTitle: '題をもらう',
  startHint: '書き始めた。60秒',
  closed: '1分。紙を閉じた',
  closedEmpty: '何も書かなかった紙は残らない',
  next: '次の1枚',
  finishToday: '今日はここまで',
  deepDive: '行をタップすると、次の題になる',
  sameTitle: '同じ題でもう1枚',
  linesOf: (n: number) => `${n}行`,
  // 完了
  done: (n: number, goal: number) => (n >= goal ? `${n}枚、書いた` : `${n}枚`),
  doneSub: '読み返さない。3か月後に届く',
  oneMore: 'もう1枚',
  arrivedBtn: (date: string, round: number) => `${date}の束が届いている(${round === 1 ? '3か月' : '6か月'})`,
  // 見返し
  reviewHint: (round: number) =>
    round === 1 ? '3か月前の自分。さっと読む。直さない' : '6か月前の自分。これで最後。さっと読む',
  reviewDone: '読んだ',
  // 更新
  updateReady: '新しい版がある。更新する',
} as const
