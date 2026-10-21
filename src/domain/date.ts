/** 端末ローカル日付 YYYY-MM-DD（toISOString はUTCのためズレる。使わない） */
export function toLocalDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLocalDate(s: string): boolean {
  if (!LOCAL_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function addDays(localDate: string, n: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return toLocalDate(new Date(y, m - 1, d + n));
}

/** 例: 10月21日（水） */
export function formatJa(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日（${w}）`;
}
