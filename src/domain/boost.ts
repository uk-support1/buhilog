import type { BoostAction, DailyEntry, Problem } from './types';

/**
 * 調子が低い朝（朝の調子が3以下）に、その場で出す「上げる方法」。
 * やったかどうかと、やったあとの調子を記録し、ふりかえりで「どれが上がりやすいか」を見る。
 */
export const BOOST_NONE = 'none';
export const BOOST_THRESHOLD = 3;
/** 「朝の調子」の項目（名前で見つける） */
export const BOOST_PROBLEM_NAME = '朝の調子';

export const DEFAULT_BOOST_ACTIONS: BoostAction[] = [
  { id: 'shower', name: 'シャワーを浴びる' },
  { id: 'bz', name: "B'zの動画をみる" },
  { id: 'univ', name: '大学の時の動画をみる' },
  { id: BOOST_NONE, name: '何もしなかった' },
];

/** 一覧（「何もしなかった」はいつも最後に1つだけ） */
export function boostActionsOf(saved?: BoostAction[]): BoostAction[] {
  const base = (saved ?? DEFAULT_BOOST_ACTIONS).filter((a) => a.id !== BOOST_NONE);
  const none = (saved ?? DEFAULT_BOOST_ACTIONS).find((a) => a.id === BOOST_NONE) ?? DEFAULT_BOOST_ACTIONS[DEFAULT_BOOST_ACTIONS.length - 1];
  return [...base, none];
}

export const findBoostProblem = (problems: Problem[]) => problems.find((p) => p.name === BOOST_PROBLEM_NAME && !p.archivedAt);

/** 「何もしなかった」とほかを同時に選ばない */
export function toggleBoost(cur: string[], id: string): string[] {
  if (cur.includes(id)) return cur.filter((x) => x !== id);
  return id === BOOST_NONE ? [BOOST_NONE] : [...cur.filter((x) => x !== BOOST_NONE), id];
}

export interface BoostRow { id: string; name: string; used: number; measured: number; meanDelta: number | null; meanAfter: number | null }

/**
 * 項目ごとのまとめ。変化＝（やったあとの調子）−（朝の調子）。やったあとの調子を入れた日だけで平均する。
 * 2つ以上やった日は、それぞれにその日の変化を数える。
 */
export function boostSummary(entries: DailyEntry[], morningId: string, actions: BoostAction[]): BoostRow[] {
  return actions.map((a) => {
    const days = entries.filter((e) => e.boost?.actions.includes(a.id));
    const deltas: number[] = [];
    const afters: number[] = [];
    for (const e of days) {
      const before = e.problemRatings[morningId];
      const after = e.boost?.after;
      if (before == null || after == null) continue;
      deltas.push(after - before);
      afters.push(after);
    }
    const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
    return { id: a.id, name: a.name, used: days.length, measured: deltas.length, meanDelta: mean(deltas), meanAfter: mean(afters) };
  }).filter((r) => r.used > 0);
}
