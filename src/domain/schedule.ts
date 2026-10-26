import { addDays } from './date';
import type { CalendarEvent } from './types';

/** 予定の日付計算（繰り返し・複数日・除外日）。端末のローカル日付（YYYY-MM-DD）だけで計算し、UTCのずれを持ち込まない。 */

const parse = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return { y, m, d: dd }; };
const utc = (d: string) => { const p = parse(d); return Date.UTC(p.y, p.m - 1, p.d); };
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000);
export const weekdayOf = (d: string) => new Date(utc(d)).getUTCDay(); // 0=日〜6=土
const pad = (n: number) => String(n).padStart(2, '0');
const make = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** 存在する日付ならそのISO、なければ null（例: 2月30日） */
function validDate(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? make(y, m, d) : null;
}

const CAP = 5000;

/** 繰り返しを含め、開始日が to 以前の「発生の開始日」を、古い順に返す（除外日は含めない） */
export function occurrenceStarts(ev: CalendarEvent, to: string): string[] {
  const first = ev.date;
  const ex = new Set(ev.exdates ?? []);
  const keep = (d: string) => !ex.has(d);
  if (!ev.repeat) return first <= to && keep(first) ? [first] : [];
  const r = ev.repeat;
  const limit = r.until && r.until < to ? r.until : to;
  const out: string[] = [];
  let produced = 0; // 回数の数え方には、除外日も含める（「全部で◯回」の考え方）
  const add = (d: string): boolean => {
    if (r.count !== undefined && produced >= r.count) return false;
    produced++;
    if (keep(d)) out.push(d);
    return true;
  };
  if (r.freq === 'daily') {
    for (let d = first, i = 0; d <= limit && i < CAP; d = addDays(d, r.interval), i++) if (!add(d)) break;
  } else if (r.freq === 'weekly') {
    const wds = [...new Set(r.weekdays?.length ? r.weekdays : [weekdayOf(first)])].sort((a, b) => a - b);
    const weekStart = addDays(first, -weekdayOf(first)); // 日曜はじまり
    outer: for (let w = 0; w < CAP; w += r.interval) {
      const ws = addDays(weekStart, w * 7);
      if (ws > limit) break;
      for (const wd of wds) {
        const d = addDays(ws, wd);
        if (d < first) continue;
        if (d > limit) break;
        if (!add(d)) break outer;
      }
    }
  } else if (r.freq === 'monthly') {
    const p = parse(first);
    for (let k = 0; k < CAP; k += r.interval) {
      const total = p.m - 1 + k;
      const d = validDate(p.y + Math.floor(total / 12), (total % 12) + 1, p.d); // 31日などが無い月は飛ばす
      if (d === null) { if (make(p.y + Math.floor(total / 12), (total % 12) + 1, 1) > limit) break; continue; }
      if (d > limit) break;
      if (!add(d)) break;
    }
  } else {
    const p = parse(first);
    for (let k = 0; k < CAP; k += r.interval) {
      const d = validDate(p.y + k, p.m, p.d); // 2月29日は、うるう年だけ
      if (d === null) { if (make(p.y + k, p.m, 1) > limit) break; continue; }
      if (d > limit) break;
      if (!add(d)) break;
    }
  }
  return out;
}

export interface Occurrence {
  event: CalendarEvent;
  /** この発生の開始日 */
  startDate: string;
  /** 複数日の予定の、何日目か（1から） */
  dayNo: number;
  totalDays: number;
}

const spanOf = (ev: CalendarEvent) => (ev.endDate ? daysBetween(ev.date, ev.endDate) : 0);

/** 並び: 終日 → 時刻のある予定（早い順）→ 時間未定。同じなら名前順 */
function order(a: Occurrence, b: Occurrence): number {
  const rank = (o: Occurrence) => (o.event.allDay ? 0 : o.event.startTime ? 1 : 2);
  return rank(a) - rank(b) || (a.event.startTime ?? '').localeCompare(b.event.startTime ?? '') || a.event.title.localeCompare(b.event.title, 'ja');
}

/** 期間 [from, to] の各日の予定。キーは日付 */
export function eventsInRange(events: CalendarEvent[], from: string, to: string): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>();
  for (const ev of events) {
    const span = spanOf(ev);
    for (const s of occurrenceStarts(ev, to)) {
      for (let k = 0; k <= span; k++) {
        const day = addDays(s, k);
        if (day < from || day > to) continue;
        const list = map.get(day) ?? [];
        list.push({ event: ev, startDate: s, dayNo: k + 1, totalDays: span + 1 });
        map.set(day, list);
      }
    }
  }
  for (const list of map.values()) list.sort(order);
  return map;
}

export function eventsOn(events: CalendarEvent[], date: string): Occurrence[] {
  return eventsInRange(events, date, date).get(date) ?? [];
}

/** 画面に出す時刻の表記（例: 10:00〜11:30 / 終日 / 時間未定） */
export function timeLabel(o: Occurrence): string {
  const e = o.event;
  const t = e.allDay ? '終日' : e.startTime && e.endTime && !e.endDate ? `${e.startTime}〜${e.endTime}` : e.startTime ? `${e.startTime}〜` : '時間未定';
  return o.totalDays > 1 ? `${t}（${o.dayNo}日目/${o.totalDays}日間）` : t;
}

export const REPEAT_LABEL = { daily: '毎日', weekly: '毎週', monthly: '毎月', yearly: '毎年' } as const;
export const WEEKDAY_LABEL = ['日', '月', '火', '水', '木', '金', '土'] as const;
