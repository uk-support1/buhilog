import type { Candidate, Strength } from './correlation';

/**
 * 「関連がありそうな要因」を、数字ではなく文章で伝えるための部品。
 * 見栄え・使用感を優先して、「想定される理由」を、分かりやすい言葉で書く（すべて仮説であり、確定ではない）。
 * 文言の調整は、このファイルだけで完結する。
 */

/** カードの最後に出す一言。不要になったら空文字にすれば消える。 */
export const NOTE_TEXT = '※あなたの記録から見えた仮説です。確定ではありません。つらさが続くときは、主治医にも相談してください。';

export const EVIDENCE_LABEL = { likely: '最有力', maybe: '要注目', weak: 'ヒント程度' } as const;

const INTENS: Record<Strength, string> = { tiny: 'ごくわずかに', weak: 'やや', moderate: 'かなり', strong: 'はっきり' };
const f1 = (n: number) => n.toFixed(1);

type Kind =
  | 'hours' | 'bed' | 'wake' | 'awake' | 'nap'
  | 'alcohol' | 'phone' | 'morning' | 'exercise' | 'multitask' | 'social' | 'helpful' | 'sign' | 'generic';

function kindOf(c: Candidate): Kind {
  if (c.loop) return 'sign';
  switch (c.key) {
    case 's:hours': return 'hours';
    case 's:bed': return 'bed';
    case 's:wake': return 'wake';
    case 's:awake': return 'awake';
    case 's:nap': return 'nap';
  }
  const n = c.name;
  if (/酒/.test(n)) return 'alcohol';
  if (/スマホ|画面/.test(n)) return 'phone';
  if (c.group === '運動要因' || /腕立|カール|筋トレ|腹筋|チン|シュラ|運動/.test(n)) return 'exercise';
  if (/ヨガ|朝日|朝レン|ストレッチ/.test(n) || c.group === '朝要因') return 'morning';
  if (/マルチタスク/.test(n)) return 'multitask';
  if (/コミュニケーション|会話|話す/.test(n)) return 'social';
  if (/役に立つ/.test(n)) return 'helpful';
  return 'generic';
}

const REVERSE = '（調子が先で、行動が後、という）逆の関係の可能性もあります。';

/** 想定される理由（仮説）。plus = 要因が大きい/実施した日ほど調子が良い、minus = 調子が悪い */
const REASONS: Record<Kind, { plus: string[]; minus: string[] }> = {
  hours: {
    plus: ['睡眠がしっかり取れた日は、体の回復が進み、痛みや疲れを感じにくくなっている可能性があります。', '睡眠不足は、痛みへの敏感さや気分の落ち込みを強めることが知られています。その逆の効果が出ている可能性があります。'],
    minus: ['長く寝すぎると、生活リズムが崩れたり、日中の活動量が減ったりして、かえって調子を落とす可能性があります。', '調子が悪い日ほど長く寝てしまう、という' + REVERSE],
  },
  bed: {
    plus: ['あなたの体内時計が、やや夜型に合っている可能性があります。', '遅くまで起きていられる日は、そもそも元気な日である、という' + REVERSE],
    minus: ['就寝が遅くなると、睡眠時間や眠りの深さが削られ、翌日の調子に響く可能性があります。', '体内時計が後ろにずれて、朝のだるさが強まっている可能性があります。'],
  },
  wake: {
    plus: ['しっかり眠れた結果として、遅めに起きている可能性があります。', '朝にゆとりのある日は、心や体への負担が少ない可能性があります。'],
    minus: ['起床が遅いと、朝の光を浴びる時間が減り、体内時計が乱れやすくなる可能性があります。', '調子が悪くて起きられなかった、という' + REVERSE],
  },
  awake: {
    plus: ['意外な結果です。覚醒が多くても、すぐに眠り直せている日は、影響が小さい可能性があります。', '偶然が混ざっている可能性もあるので、もう少し記録を続けて確かめましょう。'],
    minus: ['夜中に目が覚めるほど眠りが浅くなり、翌日の疲労感や痛みが強まっている可能性があります。', '覚醒の回数は、睡眠の質のわかりやすい目安です。減らす工夫に価値がある可能性があります。'],
  },
  nap: {
    plus: ['短い昼寝が、疲れの回復に役立っている可能性があります。', '昼寝ができる日は、そもそも余裕のある日である、という' + REVERSE],
    minus: ['昼寝が長いと、夜の眠りが浅くなったり、リズムが乱れたりする可能性があります。', '調子が悪い日ほど昼寝が増える、という' + REVERSE],
  },
  alcohol: {
    plus: ['飲んだ日は、気分転換や人との交流で、気持ちが軽くなっている可能性があります（睡眠への影響は、別に確認が必要です）。', '記録の偏りで、そう見えている可能性もあります。'],
    minus: ['アルコールは、寝つきを良くしても眠りの後半を浅くし、翌日のだるさや頭痛につながる可能性があります。', '量が増えるほど、睡眠の質と翌日の調子に響きやすい可能性があります。'],
  },
  phone: {
    plus: ['寝る前の画面の光や情報が減ると、寝つきと眠りの深さが良くなる可能性があります。', '気持ちが落ち着いた状態で眠れている可能性があります。'],
    minus: ['見ない日は、別の事情（疲れや体調）で早く寝ている日である可能性があります。', '偶然の可能性もあるので、続けて確かめましょう。'],
  },
  morning: {
    plus: ['朝の光や軽い運動は体内時計を整え、気分や体の緊張をゆるめる可能性があります。', '朝にひとつ「できた」があることで、1日の自信につながる可能性があります。'],
    minus: ['朝に頑張りすぎて、疲れが出ている可能性があります。', '調子が悪い日に、整えようとして朝にやっている、という' + REVERSE],
  },
  exercise: {
    plus: ['体を動かすと血流や気分が良くなり、緊張や不安がやわらぐ可能性があります。', '運動できる日は、もともと調子が良い日である、という' + REVERSE],
    minus: ['運動のあとの筋肉の疲れや張りが、体のつらさとして記録に出ている可能性があります。', '調子が悪い日に、体を整えようとして運動している、という' + REVERSE],
  },
  multitask: {
    plus: ['同時にいろいろやらないことで、頭の疲れがたまりにくい可能性があります。', '1つずつ片づける感覚が、気持ちの余裕につながっている可能性があります。'],
    minus: ['やらないよう意識すること自体が、負担になっている可能性があります。', '余裕のない日ほど、同時にいろいろやってしまう、という' + REVERSE],
  },
  social: {
    plus: ['人と話すことで、気持ちが軽くなったり、孤立感がやわらいだりしている可能性があります。', '元気な日ほど人と話したくなる、という' + REVERSE],
    minus: ['人との会話で、気を使って疲れている可能性があります。', '調子が悪い日に、誰かに話を聞いてもらっている、という' + REVERSE],
  },
  helpful: {
    plus: ['「誰かの役に立てた」という実感が、自信や満足感につながっている可能性があります。', '調子が良い日ほど、人のために動ける、という' + REVERSE],
    minus: ['人のために頑張りすぎて、疲れがたまっている可能性があります。', '調子が悪い日に、無理に人の役に立とうとしている可能性もあります。'],
  },
  sign: {
    plus: ['姿勢や表情は、気分と互いに影響し合うことが知られています。整えることが、気持ちを引き上げるきっかけになっている可能性があります。', '一方で、気分が良い日だから自然と整っている、という逆の関係もありえます。生き生きとした「好循環」の入口として、使える可能性があります。'],
    minus: ['意識しすぎて、かえって力が入ってしまっている可能性があります。', '調子が悪い日に、気持ちを立て直そうと意識している、という逆の関係の可能性もあります。'],
  },
  generic: {
    plus: ['この行動が、調子を支えている可能性があります。', '調子が良い日に、その行動をしやすい、という' + REVERSE],
    minus: ['この行動が、負担になっている可能性があります。', '調子が悪い日に、対処としてその行動をしている、という' + REVERSE],
  },
};

export interface Narrative {
  /** 一覧に出す、インパクトのある一文 */
  headline: string;
  /** 数字を言葉にしたもの */
  numbers: string[];
  /** 想定される理由 */
  reasons: string[];
  /** 次にやってみること（やさしい提案） */
  tip: string;
  note: string;
}

export function gapWords(d: number): string {
  const a = Math.abs(d);
  if (a < 0.3) return 'ほとんど差はありません';
  if (a < 0.7) return '平均でおよそ半段階の差';
  if (a < 1.2) return '平均でおよそ1段階の差';
  return `平均で${f1(a)}段階の差`;
}

function tipFor(c: Candidate, kind: Kind): string {
  const two = '2週間ほど、調子の変化を見てみましょう。';
  if (kind === 'sign') {
    return c.positive
      ? '調子が重い日こそ、背筋と口角を整えることを「最初の一手」にして、そのあとの調子を記録で確かめてみましょう。'
      : '力まずに、1日のうち数回だけ意識する形にして、' + two;
  }
  if (c.kind === 'sleep') {
    // 睡眠の項目では、睡眠を減らす提案はしない
    if (kind === 'awake') return '寝る前の習慣（画面・お酒・カフェインなど）を見直して、覚醒の回数がどう変わるかを、' + two;
    return '就寝・起床の時刻をできるだけ一定にして、' + two;
  }
  if (kind === 'alcohol') return c.positive ? '飲んだ日の睡眠も、あわせて見比べてみましょう。' : '量を控えめにした日をつくって、' + two;
  const what = c.kind === 'approach' ? `「${c.name}」` : `${c.name}が${c.more}日`;
  return c.positive
    ? `${what}を、無理のない範囲で増やして、${two}`
    : c.kind === 'approach'
      ? `${what}をいったん控えめにして、${two}`
      : `${what}を、無理のない範囲で減らして、${two}`;
}

/** problemName: 選んだ困りごとの名前。点数は「5＝いちばん良い」 */
export function buildNarrative(problemName: string, c: Candidate): Narrative {
  const kind = kindOf(c);
  const good = c.positive ? '良い' : '悪い';
  const subject = c.kind === 'signal' ? `「${c.name}」が良い状態の日ほど` : c.kind === 'approach' ? `「${c.name}」を実施した日は` : `${c.name}が${c.more}日ほど`;
  const target = `「${problemName}」の調子`;
  const headline = c.strength === 'tiny'
    ? `${subject}、${target}にごくわずかな差が見えるだけです`
    : `${subject}、${target}が${INTENS[c.strength]}${good}傾向があります`;

  const d = c.detail;
  const numbers: string[] = [];
  if (c.kind === 'signal' && d.type === 'numeric') {
    numbers.push(`「${c.name}」が高め（${Math.round(d.cut * 10) / 10}より上）の日の調子の平均は ${f1(d.meanHigh)}（${d.nHigh}日）、そうでない日は ${f1(d.meanLow)}（${d.nLow}日）。${gapWords(d.meanHigh - d.meanLow)}です。`);
  } else if (d.type === 'binary') {
    numbers.push(`調子の平均は、実施した日が ${f1(d.meanA)}（${d.nA}日）、しなかった日が ${f1(d.meanB)}（${d.nB}日）。${gapWords(d.meanA - d.meanB)}です。`);
  } else {
    numbers.push(`${c.name}が${c.more}側の日の調子の平均は ${f1(d.meanHigh)}（${d.nHigh}日）、そうでない日は ${f1(d.meanLow)}（${d.nLow}日）。${gapWords(d.meanHigh - d.meanLow)}です。`);
  }
  numbers.push(`比べた記録は ${c.n}日分です（点数は、5が一番良く、1が調子が悪い）。`);

  return { headline, numbers, reasons: REASONS[kind][c.positive ? 'plus' : 'minus'], tip: tipFor(c, kind), note: NOTE_TEXT };
}
