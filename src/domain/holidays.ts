/** 日本の祝日（通信なしで計算する。2000年以降の法律どおり。振替休日・国民の休日を含む） */
const p = (n: number) => String(n).padStart(2, '0');
const fmt = (y: number, m: number, d: number) => `${y}-${p(m)}-${p(d)}`;
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
/** 第n週の月曜日の日にち */
const nthMonday = (y: number, m: number, n: number) => 1 + ((8 - dow(y, m, 1)) % 7) + (n - 1) * 7;
const equinox = (y: number, base: number) => Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

const cache = new Map<number, Map<string, string>>();

function build(y: number): Map<string, string> {
  const h = new Map<string, string>();
  const add = (m: number, d: number, name: string) => h.set(fmt(y, m, d), name);
  add(1, 1, '元日');
  add(1, nthMonday(y, 1, 2), '成人の日');
  add(2, 11, '建国記念の日');
  if (y >= 2020) add(2, 23, '天皇誕生日');
  add(3, equinox(y, 20.8431), '春分の日');
  add(4, 29, '昭和の日');
  add(5, 3, '憲法記念日');
  add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  if (y === 2020) { add(7, 23, '海の日'); add(7, 24, 'スポーツの日'); add(8, 10, '山の日'); }
  else if (y === 2021) { add(7, 22, '海の日'); add(7, 23, 'スポーツの日'); add(8, 8, '山の日'); }
  else {
    add(7, nthMonday(y, 7, 3), '海の日');
    add(8, 11, '山の日');
    add(10, nthMonday(y, 10, 2), y >= 2020 ? 'スポーツの日' : '体育の日');
  }
  add(9, nthMonday(y, 9, 3), '敬老の日');
  add(9, equinox(y, 23.2488), '秋分の日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');
  // 国民の休日: 前後が祝日にはさまれた平日（日曜でない日）
  for (let d = 2; d <= 30; d++) {
    const k = fmt(y, 9, d);
    if (!h.has(k) && h.has(fmt(y, 9, d - 1)) && h.has(fmt(y, 9, d + 1)) && dow(y, 9, d) !== 0) h.set(k, '国民の休日');
  }
  // 振替休日: 祝日が日曜なら、次の「祝日でない日」
  for (const k of [...h.keys()].sort()) {
    const [yy, mm, dd] = k.split('-').map(Number);
    if (dow(yy, mm, dd) !== 0) continue;
    let t = Date.UTC(yy, mm - 1, dd + 1);
    for (;;) {
      const dt = new Date(t);
      const key = fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      if (!h.has(key)) { h.set(key, '振替休日'); break; }
      t += 86_400_000;
    }
  }
  return h;
}

/** その日が祝日なら、名前を返す */
export function holidayName(localDate: string): string | undefined {
  const y = Number(localDate.slice(0, 4));
  if (!cache.has(y)) cache.set(y, build(y));
  return cache.get(y)!.get(localDate);
}
