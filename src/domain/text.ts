import { MIN_PER_GROUP, type Comparison } from './analytics';

const f1 = (n: number) => n.toFixed(1);

export function describeComparison(c: Comparison, approach: string): { headline: string; lines: string[]; caution: string[] } {
  const counts = `実施した日 ${c.nDone}日・実施しなかった日 ${c.nNotDone}日`;
  const caution = [
    'この差は、記録された日どうしの関連を示すだけで、原因や効果を示すものではありません。',
    '症状が重い日にその対処を選ぶ（またはしない）など、逆の関係も考えられます。',
    '睡眠やその日の活動など、記録していない要因も影響する可能性があります。',
  ];
  const lines: string[] = [];
  if (c.status === 'impossible') {
    const need = [
      c.needMoreDone > 0 ? `「実施した日」あと${c.needMoreDone}日` : '',
      c.needMoreNotDone > 0 ? `「実施しなかった日」あと${c.needMoreNotDone}日` : '',
    ].filter(Boolean).join('、');
    return {
      headline: '比較できる記録がまだ十分ではありません。',
      lines: [`現在: ${counts}。`, `「${approach}」を、症状の評価と一緒に記録していくと比較できます（目安: ${need}）。`, '無理のない範囲で記録を続けてみてください。'],
      caution: [],
    };
  }
  lines.push(`直近${c.periodDays}日間の記録: ${counts}。`);
  lines.push(`平均: 実施した日 ${f1(c.meanDone!)}、実施しなかった日 ${f1(c.meanNotDone!)}。`);
  if (c.status === 'reference') {
    const need = [
      c.needMoreDone > 0 ? `「実施した日」あと${c.needMoreDone}日` : '',
      c.needMoreNotDone > 0 ? `「実施しなかった日」あと${c.needMoreNotDone}日` : '',
    ].filter(Boolean).join('、');
    return {
      headline: '判断材料が少ないため、参考値としてのみ表示します。',
      lines: [
        ...lines,
        `差の表示には、各${MIN_PER_GROUP}日以上の記録が必要です（あと: ${need}）。`,
        ...(c.periodDays < MIN_PER_GROUP * 2 ? [`直近${c.periodDays}日間では、合計でも${MIN_PER_GROUP * 2}日に届かないため、この期間では参考値までです。記録がたまったら「直近14日」以上に切り替えてください。`] : []),
      ],
      caution,
    };
  }
  const d = c.difference!;
  lines.push(`差（実施した日 − 実施しなかった日）: ${d > 0 ? '+' : ''}${f1(d)}ポイント。数値が大きいほど調子が良い（5が最良）記録です。`);
  if (c.sdDone != null && c.sdNotDone != null) lines.push(`ばらつき（標準偏差）: 実施 ${f1(c.sdDone)}、非実施 ${f1(c.sdNotDone)}。`);
  return { headline: '観察された平均の差（探索的な表示）', lines, caution };
}
