import { compareApproach, windowDates } from './analytics';
import { MIN_NUMERIC_DAYS, MIN_PER_GROUP, spearman } from './correlation';
import { gapWords } from './narrative';
import type { Approach, DailyEntry, Problem } from './types';

/** いきいきサイン1つ分のまとめ（ふりかえり用）。「状態」と「意識した」を分けて見る。 */
export interface SignSummary {
  sign: Problem;
  practice: Approach;
  stateDays: number;
  stateMean: number | null;
  practicedDays: number;
  notPracticedDays: number;
  /** 意識した日 vs しなかった日の「状態」の平均（きっかけとしての働き） */
  lever: { nDone: number; nNotDone: number; meanDone: number | null; meanNotDone: number | null; enough: boolean };
  /** 選んだ困りごととの関係（合図としての働き） */
  toTarget?: { n: number; rho: number; enough: boolean };
  practiceToTarget?: { nDone: number; nNotDone: number; meanDone: number | null; meanNotDone: number | null; enough: boolean };
}

const f1 = (n: number) => n.toFixed(1);

export function summarizeSign(entries: DailyEntry[], sign: Problem, practice: Approach, target: Problem | undefined, endDate: string, days: number): SignSummary {
  const byDate = new Map(entries.map((e) => [e.localDate, e]));
  const win = windowDates(endDate, days).flatMap((d) => (byDate.has(d) ? [byDate.get(d)!] : []));
  const states = win.flatMap((e) => (e.problemRatings[sign.id] != null ? [e.problemRatings[sign.id] as number] : []));
  const practicedDays = win.filter((e) => e.approachStatuses[practice.id] === 'done').length;
  const notPracticedDays = win.filter((e) => e.approachStatuses[practice.id] === 'not_done').length;
  const lv = compareApproach(entries, sign.id, practice.id, endDate, days);
  const out: SignSummary = {
    sign, practice, stateDays: states.length,
    stateMean: states.length ? states.reduce((a, b) => a + b, 0) / states.length : null,
    practicedDays, notPracticedDays,
    lever: { nDone: lv.nDone, nNotDone: lv.nNotDone, meanDone: lv.meanDone, meanNotDone: lv.meanNotDone, enough: lv.nDone >= MIN_PER_GROUP && lv.nNotDone >= MIN_PER_GROUP },
  };
  if (target && target.id !== sign.id) {
    const xs: number[] = [], ys: number[] = [];
    for (const e of win) {
      const a = e.problemRatings[sign.id], b = e.problemRatings[target.id];
      if (a != null && b != null) { xs.push(a); ys.push(b); }
    }
    const sp = xs.length >= MIN_NUMERIC_DAYS ? spearman(xs, ys) : null;
    out.toTarget = { n: xs.length, rho: sp?.rho ?? 0, enough: !!sp };
    const pt = compareApproach(entries, target.id, practice.id, endDate, days);
    out.practiceToTarget = { nDone: pt.nDone, nNotDone: pt.nNotDone, meanDone: pt.meanDone, meanNotDone: pt.meanNotDone, enough: pt.nDone >= MIN_PER_GROUP && pt.nNotDone >= MIN_PER_GROUP };
  }
  return out;
}

const strengthWord = (r: number) => { const a = Math.abs(r); return a < 0.1 ? 'ごくわずかに' : a < 0.3 ? 'やや' : a < 0.5 ? 'かなり' : 'はっきり'; };

/** 画面に出す文章（見栄え優先。すべて仮説） */
export function signStory(s: SignSummary, targetName?: string): { lines: string[]; hint: string; loop: boolean } {
  const name = s.sign.name;
  const lines: string[] = [];
  lines.push(s.stateMean == null ? `「${name}」の状態：まだ記録がありません。` : `「${name}」の状態（自然にできていた度合い）：平均 ${f1(s.stateMean)}（${s.stateDays}日分）`);
  lines.push(`「${s.practice.name}」日：${s.practicedDays}日（しなかった日 ${s.notPracticedDays}日）`);
  const lv = s.lever;
  let leverUp = false;
  if (lv.enough && lv.meanDone != null && lv.meanNotDone != null) {
    const d = lv.meanDone - lv.meanNotDone;
    leverUp = d >= 0.3;
    lines.push(
      `【きっかけとして】意識した日は、「${name}」の状態が、しなかった日より${Math.abs(d) < 0.3 ? 'ほとんど変わりません' : d > 0 ? `${gapWords(d).replace('の差', '')}高い` : `${gapWords(d).replace('の差', '')}低い`}（${f1(lv.meanDone)}と${f1(lv.meanNotDone)}、${lv.nDone}日／${lv.nNotDone}日）。`,
    );
  } else {
    lines.push(`【きっかけとして】意識した日・しなかった日が、それぞれ5日分そろうと比べられます（いま ${lv.nDone}日／${lv.nNotDone}日）。`);
  }
  let signalUp = false;
  if (s.toTarget && targetName) {
    const t = s.toTarget;
    if (t.enough) {
      signalUp = t.rho >= 0.3;
      lines.push(`【合図として】「${name}」が良い日ほど、「${targetName}」の調子が${strengthWord(t.rho)}${t.rho >= 0 ? '良い' : '悪い'}傾向があります（${t.n}日分）。`);
    } else lines.push(`【合図として】「${targetName}」との関係は、14日分以上の記録がたまると見えてきます（いま ${t.n}日）。`);
    const pt = s.practiceToTarget;
    if (pt?.enough && pt.meanDone != null && pt.meanNotDone != null) {
      lines.push(`「${s.practice.name}」日の「${targetName}」の調子：${f1(pt.meanDone)}（${pt.nDone}日）、しなかった日は ${f1(pt.meanNotDone)}（${pt.nNotDone}日）。`);
    }
  }
  const loop = leverUp && signalUp;
  const hint = loop
    ? '「整える → 気分が上がる → 調子が良い」という好循環が、起きている可能性があります。調子が重い日こそ、最初の一手として試す価値がありそうです。'
    : 'きっかけと合図を分けて見ています。どちらが先かまでは、記録だけでは分かりません。記録が増えると、好循環かどうかが見えてきます。';
  return { lines, hint, loop };
}
