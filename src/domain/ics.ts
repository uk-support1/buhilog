import { EVENT_COLORS, type CalendarEvent, type Repeat } from './types';
import { addDays } from './date';
import { weekdayOf } from './schedule';

/** 読み込んだ予定（idや作成時刻は、保存のときに付ける） */
export type ImportedEvent = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>;
export interface IcsResult { events: ImportedEvent[]; skipped: number }

const MAX_EVENTS = 5000;

/** 折り返された行をつなぎ、「名前;属性:値」に分ける */
function unfold(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  return lines.filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    const head = i < 0 ? l : l.slice(0, i);
    const [name, ...params] = head.split(';');
    return { name: name.toUpperCase(), params: params.join(';').toUpperCase(), value: i < 0 ? '' : l.slice(i + 1) };
  });
}
const unescape = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** 20261122 / 20261122T093000 / 20261122T003000Z → 手元の日付と時刻（Zは、この端末の時刻に直す） */
function parseDt(value: string, params: string): { date: string; time?: string } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mi, , z] = m;
  if (hh === undefined || params.includes('VALUE=DATE')) return { date: `${y}-${mo}-${d}` };
  if (z) {
    const dt = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi));
    const p = (n: number) => String(n).padStart(2, '0');
    return { date: `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`, time: `${p(dt.getHours())}:${p(dt.getMinutes())}` };
  }
  return { date: `${y}-${mo}-${d}`, time: `${hh}:${mi}` };
}

const DAY_CODE: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function parseRrule(v: string): Repeat | null {
  const p = Object.fromEntries(v.split(';').map((kv) => kv.split('=') as [string, string]));
  const freq: Repeat['freq'] | undefined = ({ DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' } as Record<string, Repeat['freq']>)[p.FREQ];
  if (!freq) return null;
  // 「毎月の第2火曜」のような、日付で決まらない繰り返しは、対応しない
  if (p.BYSETPOS || p.BYMONTHDAY || p.BYYEARDAY || p.BYWEEKNO || (freq !== 'weekly' && p.BYDAY)) return null;
  const r: Repeat = { freq, interval: Math.max(1, Math.min(99, Number(p.INTERVAL) || 1)) };
  if (p.BYDAY) {
    const days = p.BYDAY.split(',').map((c) => (/^[+-]?\d/.test(c) ? NaN : DAY_CODE[c]));
    if (days.some((d) => d === undefined || Number.isNaN(d))) return null;
    r.weekdays = days;
  }
  if (p.COUNT) r.count = Math.min(999, Math.max(1, Number(p.COUNT) || 1));
  if (p.UNTIL) { const u = parseDt(p.UNTIL, ''); if (u) r.until = u.date; }
  return r;
}

/** カレンダーファイル(.ics)を読む。対応できない予定は数えて飛ばす（他のタイムゾーンは、書かれた時刻のまま扱う） */
export function parseIcs(text: string): IcsResult {
  const out: ImportedEvent[] = [];
  let skipped = 0;
  let cur: ReturnType<typeof unfold> | null = null;
  for (const l of unfold(text)) {
    if (l.name === 'BEGIN' && l.value.toUpperCase() === 'VEVENT') { cur = []; continue; }
    if (l.name === 'END' && l.value.toUpperCase() === 'VEVENT' && cur) {
      const ev = build(cur);
      if (ev) { if (out.length < MAX_EVENTS) out.push(ev); else skipped++; } else skipped++;
      cur = null; continue;
    }
    cur?.push(l);
  }
  return { events: out, skipped };
}

function build(lines: ReturnType<typeof unfold>): ImportedEvent | null {
  const get = (n: string) => lines.find((l) => l.name === n);
  const title = unescape(get('SUMMARY')?.value ?? '').trim().slice(0, 100);
  const s = get('DTSTART');
  const start = s && parseDt(s.value, s.params);
  if (!title || !start) return null;
  const e = get('DTEND');
  const end = e && parseDt(e.value, e.params);
  const allDay = start.time === undefined;
  const ev: ImportedEvent = { title, date: start.date, allDay, source: 'ics' };
  const uid = get('UID')?.value.trim();
  if (uid) ev.uid = uid.slice(0, 300);
  if (allDay) {
    // 終日の終了日は、ファイルでは「翌日」で書かれる
    if (end) { const last = addDays(end.date, -1); if (last > start.date) ev.endDate = last; }
  } else {
    ev.startTime = start.time;
    if (end?.time) {
      if (end.date === start.date) { if (end.time > start.time!) ev.endTime = end.time; }
      else { ev.endDate = end.date; ev.endTime = end.time; }
    }
  }
  const place = unescape(get('LOCATION')?.value ?? '').trim();
  if (place) ev.place = place.slice(0, 100);
  const memo = unescape(get('DESCRIPTION')?.value ?? '').trim();
  if (memo) ev.memo = memo.slice(0, 2000);
  const col = get('X-BUHILOG-COLOR')?.value.trim().toLowerCase();
  if (col && (EVENT_COLORS as readonly string[]).includes(col)) ev.color = col as ImportedEvent['color'];
  const rr = get('RRULE');
  if (rr) {
    const r = parseRrule(rr.value);
    if (!r) return null;
    if (r.freq === 'weekly' && r.weekdays && r.weekdays.length === 1 && r.weekdays[0] === weekdayOf(ev.date)) delete r.weekdays;
    ev.repeat = r;
  }
  const ex = lines.filter((l) => l.name === 'EXDATE').flatMap((l) => l.value.split(',').map((v) => parseDt(v, l.params)?.date)).filter((d): d is string => !!d);
  if (ex.length) ev.exdates = [...new Set(ex)];
  return ev;
}

/** 予定の一覧を、.ics の文章にする（手元のデータをほかのカレンダーへ渡す／テスト用） */
export function toIcs(events: (ImportedEvent & { uid: string })[]): string {
  const esc = (s: string) => s.replace(/[\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const d = (x: string) => x.replaceAll('-', '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BuhiLog//JP'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `SUMMARY:${esc(e.title)}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${d(e.date)}`, `DTEND;VALUE=DATE:${d(addDays(e.endDate ?? e.date, 1))}`);
    } else {
      lines.push(`DTSTART:${d(e.date)}T${e.startTime!.replace(':', '')}00`);
      if (e.endTime) lines.push(`DTEND:${d(e.endDate ?? e.date)}T${e.endTime.replace(':', '')}00`);
    }
    if (e.color) lines.push(`X-BUHILOG-COLOR:${e.color}`);
    if (e.place) lines.push(`LOCATION:${esc(e.place)}`);
    if (e.memo) lines.push(`DESCRIPTION:${esc(e.memo)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
