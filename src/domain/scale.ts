/**
 * 困りごとの点数: 1〜5（5＝いちばん良い、1＝調子が悪い）。
 * 旧スケール（0〜10、0＝なし/良い、10＝最もつらい）の記録は、読み込み時に下の対応で変換する。
 */
export const PROBLEM_MIN = 1;
export const PROBLEM_MAX = 5;
export const PROBLEM_SCALE_LABEL = '5＝いちばん良い 〜 1＝調子が悪い';

/** 旧スケール(0〜10) → 新スケール(1〜5)。表の記号 ◎0 ○3 △6 ✕9 は 5 4 2 1 に対応する。 */
export function legacyRatingToNew(old: number): number {
  if (old <= 1) return 5;
  if (old <= 4) return 4;
  if (old === 5) return 3;
  if (old <= 8) return 2;
  return 1;
}

/** 日次記録の problemRatings を旧→新に変換（null はそのまま） */
export function convertLegacyRatings(r: Record<string, number | null> | undefined): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(r ?? {})) out[k] = typeof v === 'number' ? legacyRatingToNew(v) : null;
  return out;
}
