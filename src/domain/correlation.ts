import { windowDates } from './analytics';
import { awakeningTotal } from './sleep';
import { SIGN_GROUP } from './signs';
import type { Approach, DailyEntry } from './types';

/**
 * 「どの要因が、選んだ困りごとの点数（1〜5、5が良い）と一緒に動いているか」を探す（記述統計）。
 * 同じ日の記録どうしの関連であり、原因や効果を示すものではない。
 * 比べる指標は順位相関（スピアマン）。並べ替えは、日数の違いを考慮した確からしさ（p値の小さい順）。
 */

export const MIN_NUMERIC_DAYS = 14;   // 数値の要因: 比べられる日数の下限
export const MIN_PER_GROUP = 5;       // 実施/非実施: それぞれの日数の下限
export const TOP_N = 5;

export type Evidence = 'likely' | 'maybe' | 'weak';
export type Strength = 'tiny' | 'weak' | 'moderate' | 'strong';

export interface BinaryDetail { type: 'binary'; nA: number; nB: number; meanA: number; meanB: number }   // A=実施した日 B=しなかった日
export interface NumericDetail { type: 'numeric'; cut: number; nLow: number; nHigh: number; meanLow: number; meanHigh: number }
export interface Candidate {
  key: string;
  name: string;
  group: string;
  kind: 'approach' | 'quantity' | 'sleep' | 'signal';
  /** いきいきサイン（原因にも結果にもなる項目）に関わる要因。好循環の可能性として別扱いで示す */
  loop?: boolean;
  /** 数値の要因で「大きい」を表す言葉（多い・長い・遅い）。実施有無では使わない */
  more: string;
  rho: number;
  p: number;
  n: number;
  /** 多重比較（たくさんの要因を比べること）を考慮した確からしさ */
  evidence: Evidence;
  strength: Strength;
  /** true: 要因が大きい（実施した）日ほど、点数が高い（調子が良い）傾向 */
  positive: boolean;
  detail: BinaryDetail | NumericDetail;
}
export interface RankResult { top: Candidate[]; all: Candidate[]; tested: number; ratedDays: number; windowDays: number }

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function pearson(a: number[], b: number[]): number | null {
  const ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  if (saa === 0 || sbb === 0) return null; // どちらかが全日同じ値 → 比べられない
  return sab / Math.sqrt(saa * sbb);
}

/** 標準正規分布の上側確率（Abramowitz-Stegun の近似）。両側 p = 2 * (1 - Φ(|z|)) */
function twoSidedP(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 1 - erf;
}

export function spearman(x: number[], y: number[]): { rho: number; p: number } | null {
  const n = x.length;
  if (n < 5) return null;
  const rho = pearson(ranks(x), ranks(y));
  if (rho == null) return null;
  const clamp = Math.max(-0.9999, Math.min(0.9999, rho));
  const z = (Math.atanh(clamp) * Math.sqrt(n - 3)) / Math.sqrt(1.06); // Fisher変換（スピアマン用の補正つき）
  return { rho, p: twoSidedP(z) };
}

const strengthOf = (r: number): Strength => { const a = Math.abs(r); return a < 0.1 ? 'tiny' : a < 0.3 ? 'weak' : a < 0.5 ? 'moderate' : 'strong'; };

/** 就寝・起床時刻を「18時からの経過時間」にして連続した数値にする（例: 23:30→23.5、0:30→24.5） */
function clockValue(hhmm?: string): number | null {
  const m = hhmm ? /^(\d{2}):(\d{2})$/.exec(hhmm) : null;
  if (!m) return null;
  let h = Number(m[1]) + Number(m[2]) / 60;
  if (h < 18) h += 24;
  return h;
}

interface Series { key: string; name: string; group: string; kind: Candidate['kind']; more: string; binary: boolean; loop?: boolean; value: (e: DailyEntry) => number | null }
/** いきいきサイン（状態=点数 と「意識した」の対）。要因の候補にも使う */
export interface SignalDef { id: string; name: string; approachId?: string }

function buildSeries(approaches: Approach[], signals: SignalDef[], targetId: string): Series[] {
  const list: Series[] = [];
  const loopApproach = new Set(signals.flatMap((s) => (s.approachId ? [s.approachId] : [])));
  for (const a of approaches) {
    const group = a.group || 'その他';
    list.push({
      key: `a:${a.id}`, name: a.name, group, kind: 'approach', more: '', binary: true, loop: loopApproach.has(a.id),
      value: (e) => { const s = e.approachStatuses[a.id]; return s === 'done' ? 1 : s === 'not_done' ? 0 : null; },
    });
    if (a.quantity) {
      list.push({
        key: `q:${a.id}`, name: `${a.name}の量（${a.quantity.unit}）`, group, kind: 'quantity', more: '多い', binary: false,
        value: (e) => {
          const s = e.approachStatuses[a.id];
          if (s === 'not_done') return 0;
          const q = e.approachQuantities?.[a.id];
          return s === 'done' && q != null ? q : null;
        },
      });
    }
  }
  const sleep = (key: string, name: string, more: string, value: (e: DailyEntry) => number | null): Series =>
    ({ key, name, group: '睡眠', kind: 'sleep', more, binary: false, value });
  // 別のいきいきサインの「状態」（点数）も要因の候補に。選んだ困りごと自身は除く
  for (const sg of signals) {
    if (sg.id === targetId) continue;
    list.push({ key: `r:${sg.id}`, name: sg.name, group: SIGN_GROUP, kind: 'signal', more: '高い', binary: false, loop: true, value: (e) => e.problemRatings[sg.id] ?? null });
  }
  list.push(
    sleep('s:hours', '睡眠時間', '長い', (e) => e.sleepHours ?? null),
    sleep('s:bed', '就寝時刻', '遅い', (e) => clockValue(e.bedtime)),
    sleep('s:wake', '起床時刻', '遅い', (e) => clockValue(e.wakeTime)),
    sleep('s:awake', '中途覚醒の回数', '多い', (e) => awakeningTotal(e.awakenings)),
    sleep('s:nap', '昼寝の時間', '長い', (e) => (e.sleepHours != null || e.bedtime ? e.napHours ?? 0 : null)),
  );
  return list;
}

export function rankFactors(entries: DailyEntry[], approaches: Approach[], problemId: string, endDate: string, days: number, signals: SignalDef[] = []): RankResult {
  const byDate = new Map(entries.map((e) => [e.localDate, e]));
  const rows = windowDates(endDate, days).flatMap((d) => {
    const e = byDate.get(d);
    const y = e?.problemRatings[problemId];
    return e && y != null ? [{ e, y }] : [];
  });
  const found: Candidate[] = [];
  for (const s of buildSeries(approaches, signals, problemId)) {
    const xs: number[] = [], ys: number[] = [];
    for (const { e, y } of rows) { const v = s.value(e); if (v != null) { xs.push(v); ys.push(y); } }
    const n = xs.length;
    let detail: Candidate['detail'];
    if (s.binary) {
      const A = ys.filter((_, i) => xs[i] === 1), B = ys.filter((_, i) => xs[i] === 0);
      if (A.length < MIN_PER_GROUP || B.length < MIN_PER_GROUP) continue;
      detail = { type: 'binary', nA: A.length, nB: B.length, meanA: mean(A), meanB: mean(B) };
    } else {
      if (n < MIN_NUMERIC_DAYS || new Set(xs).size < 2) continue;
      const sorted = [...xs].sort((a, b) => a - b);
      const cut = sorted[Math.floor((sorted.length - 1) / 2)]; // 中央値
      let hi = ys.filter((_, i) => xs[i] > cut), lo = ys.filter((_, i) => xs[i] <= cut);
      if (!hi.length || !lo.length) { hi = ys.filter((_, i) => xs[i] >= cut); lo = ys.filter((_, i) => xs[i] < cut); }
      if (!hi.length || !lo.length) continue;
      detail = { type: 'numeric', cut, nLow: lo.length, nHigh: hi.length, meanLow: mean(lo), meanHigh: mean(hi) };
      if (s.kind === 'quantity' && xs.filter((v) => v > 0).length < MIN_PER_GROUP) continue; // 量: 実施した日が少なすぎる
    }
    const sp = spearman(xs, ys);
    if (!sp) continue;
    found.push({
      key: s.key, name: s.name, group: s.group, kind: s.kind, more: s.more, rho: sp.rho, p: sp.p, n,
      evidence: 'weak', strength: strengthOf(sp.rho), positive: sp.rho > 0, detail, ...(s.loop ? { loop: true } : {}),
    });
  }
  // 同じ試したことの「実施有無」と「量」は重複するので、確からしさが高いほうだけ残す
  const best = new Map<string, Candidate>();
  for (const c of found) {
    const id = c.key.slice(2);
    const same = c.kind === 'sleep' ? c.key : id;
    const cur = best.get(same);
    if (!cur || c.p < cur.p || (c.p === cur.p && Math.abs(c.rho) > Math.abs(cur.rho))) best.set(same, c);
  }
  const all = [...best.values()].sort((a, b) => a.p - b.p || Math.abs(b.rho) - Math.abs(a.rho));
  const m = all.length;
  for (const c of all) c.evidence = Math.min(1, c.p * m) < 0.05 ? 'likely' : c.p < 0.05 ? 'maybe' : 'weak';
  return { top: all.slice(0, TOP_N), all, tested: m, ratedDays: rows.length, windowDays: days };
}

export { EVIDENCE_LABEL } from './narrative';
export const STRENGTH_LABEL: Record<Strength, string> = { tiny: 'ほぼなし', weak: '弱い', moderate: '中くらい', strong: '強い' };

/** 一覧に出す短い説明（向きを言葉で）。原因・効果とは言わない。 */
export function candidateSentence(c: Candidate): string {
  const tone = c.positive ? '調子が高め（良い）' : '調子が低め（悪い）';
  return c.kind === 'approach' ? `実施した日は、${tone}傾向` : `${c.name}が${c.more}日ほど、${tone}傾向`;
}
