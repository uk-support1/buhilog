import type { Approach, ApproachStatus } from './types';

/**
 * 「困りごとの点数が N 以下のときだけ出す」項目（例: やる気が低いときだけ出す、やる気を上げる方法）の表示の判断。
 * すでに記録した項目は、点数が変わっても隠さない（記録が見えなくならないように）。点数が未入力のときは出さない。
 */
export function approachShown(a: Pick<Approach, 'visibleWhenRatingAtMost'>, rating: number | null | undefined, status: ApproachStatus | undefined): boolean {
  if (a.visibleWhenRatingAtMost == null) return true;
  if (status && status !== 'unknown') return true;
  return rating != null && rating <= a.visibleWhenRatingAtMost;
}
