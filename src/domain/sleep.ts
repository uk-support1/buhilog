/** 睡眠の計算（就寝・起床・昼寝 → 合計睡眠時間、中途覚醒の合計） */

export const AWAKE_LABELS = ['1〜2時間目', '2〜3時間目', '3〜4時間目', '4〜5時間目', '5〜6時間目'] as const;
/** 合計に含める区間の数（1〜6時間目の5区間すべて） */
export const AWAKE_COUNTED = 5;

/** 時刻の選択: 10分刻み（MINUTE_STEPS の個数で刻みを決める） */
export const MINUTE_STEPS = ['00', '10', '20', '30', '40', '50'] as const;
export const DEFAULT_BEDTIME = '23:00';
export const DEFAULT_WAKETIME = '07:00';

const toMin = (hhmm: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** 夜の睡眠時間（時間）。日をまたぐ場合も正しく計算（例: 23:30→6:30 = 7.0） */
export function nightHours(bed?: string, wake?: string): number | null {
  if (!bed || !wake) return null;
  const b = toMin(bed), w = toMin(wake);
  if (b == null || w == null) return null;
  return ((w - b + 1440) % 1440) / 60;
}

/** 合計睡眠時間 = 夜の睡眠 + 昼寝。就寝・起床が揃っていなければ null */
export function totalSleepHours(bed?: string, wake?: string, napHours?: number): number | null {
  const n = nightHours(bed, wake);
  if (n == null) return null;
  return Math.round((n + (napHours ?? 0)) * 100) / 100;
}

/** 中途覚醒の合計（1〜6時間目の5区間）。すべて未入力なら null（0回とは区別する） */
export function awakeningTotal(a?: (number | null)[]): number | null {
  if (!a) return null;
  const vals = a.slice(0, AWAKE_COUNTED).filter((x): x is number => x != null);
  return vals.length ? vals.reduce((s, x) => s + x, 0) : null;
}
