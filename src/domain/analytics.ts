import { addDays } from './date';
import type { DailyEntry } from './types';

export const PERIODS = [7, 14, 28, 56] as const;
export type Period = (typeof PERIODS)[number];

/** 表示上の安全策。統計的有意性の基準ではない。 */
export const MIN_PER_GROUP = 5;
export const IMBALANCE_RATIO = 3;
export const IMBALANCE_MIN_SHARE = 0.2;

export interface DayPoint { date: string; rating: number | null }
export interface WeekAvg { from: string; to: string; mean: number | null; n: number }
export interface Series {
  days: DayPoint[];
  recorded: number;
  missing: number;
  weeks: WeekAvg[];
}

export function windowDates(endDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(endDate, i - (days - 1)));
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** A01: 欠損は補間せず null のまま。週平均は観測値のみ（分母 n を併記） */
export function buildSeries(entries: DailyEntry[], problemId: string, endDate: string, days: number): Series {
  const byDate = new Map(entries.map((e) => [e.localDate, e]));
  const pts: DayPoint[] = windowDates(endDate, days).map((date) => ({
    date,
    rating: byDate.get(date)?.problemRatings[problemId] ?? null,
  }));
  const weeks: WeekAvg[] = [];
  for (let i = 0; i < pts.length; i += 7) {
    const chunk = pts.slice(i, i + 7);
    const vals = chunk.flatMap((p) => (p.rating == null ? [] : [p.rating]));
    weeks.push({ from: chunk[0].date, to: chunk[chunk.length - 1].date, mean: mean(vals), n: vals.length });
  }
  const recorded = pts.filter((p) => p.rating != null).length;
  return { days: pts, recorded, missing: pts.length - recorded, weeks };
}

export type CompareStatus = 'impossible' | 'reference' | 'exploratory';

export interface Comparison {
  periodDays: number;
  nDone: number;
  nNotDone: number;
  /** 症状の数値はあるが実施状況が未回答の日（除外） */
  excludedUnknown: number;
  /** 症状の数値が無い日（除外） */
  excludedNoRating: number;
  meanDone: number | null;
  meanNotDone: number | null;
  sdDone: number | null;
  sdNotDone: number | null;
  /** meanDone - meanNotDone。status が impossible のときは null */
  difference: number | null;
  status: CompareStatus;
  imbalance: boolean;
  /** 探索表示に必要な、あと何日分の記録（実施/非実施それぞれ） */
  needMoreDone: number;
  needMoreNotDone: number;
}

function sd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** A02: 実施日 / 非実施日の症状スコア平均の差（記述統計）。unknown は除外。 */
export function compareApproach(
  entries: DailyEntry[], problemId: string, approachId: string, endDate: string, days: number,
): Comparison {
  const byDate = new Map(entries.map((e) => [e.localDate, e]));
  const done: number[] = [];
  const notDone: number[] = [];
  let excludedUnknown = 0;
  let excludedNoRating = 0;
  for (const d of windowDates(endDate, days)) {
    const e = byDate.get(d);
    if (!e) continue;
    const r = e.problemRatings[problemId];
    if (r == null) { excludedNoRating++; continue; }
    const s = e.approachStatuses[approachId] ?? 'unknown';
    if (s === 'done') done.push(r);
    else if (s === 'not_done') notDone.push(r);
    else excludedUnknown++;
  }
  const nDone = done.length;
  const nNotDone = notDone.length;
  const meanDone = mean(done);
  const meanNotDone = mean(notDone);
  const status: CompareStatus =
    nDone === 0 || nNotDone === 0 ? 'impossible' : Math.min(nDone, nNotDone) < MIN_PER_GROUP ? 'reference' : 'exploratory';
  const total = nDone + nNotDone;
  const small = Math.min(nDone, nNotDone);
  const large = Math.max(nDone, nNotDone);
  const imbalance = small > 0 && (large >= IMBALANCE_RATIO * small || small / total < IMBALANCE_MIN_SHARE);
  return {
    periodDays: days, nDone, nNotDone, excludedUnknown, excludedNoRating,
    meanDone, meanNotDone, sdDone: sd(done), sdNotDone: sd(notDone),
    difference: status === 'impossible' || meanDone == null || meanNotDone == null ? null : meanDone - meanNotDone,
    status, imbalance,
    needMoreDone: Math.max(0, MIN_PER_GROUP - nDone),
    needMoreNotDone: Math.max(0, MIN_PER_GROUP - nNotDone),
  };
}
