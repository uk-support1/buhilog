import { parseIcs, toIcs } from '../src/domain/ics';
import { EventSchema } from '../src/domain/types';

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`;
const ev = (lines: string[]) => `BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT\r\n`;

describe('ics 読み込み', () => {
  it('時刻つき・終日・複数日を読める（終日の終了は翌日表記）', () => {
    const r = parseIcs(wrap(
      ev(['UID:a', 'SUMMARY:会議', 'DTSTART:20261110T140000', 'DTEND:20261110T150000', 'LOCATION:市役所']) +
      ev(['UID:b', 'SUMMARY:社会科見学', 'DTSTART;VALUE=DATE:20261102', 'DTEND;VALUE=DATE:20261103']) +
      ev(['UID:c', 'SUMMARY:研修', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261122']),
    ));
    expect(r.skipped).toBe(0);
    expect(r.events[0]).toMatchObject({ title: '会議', date: '2026-11-10', startTime: '14:00', endTime: '15:00', place: '市役所', allDay: false, source: 'ics', uid: 'a' });
    expect(r.events[1]).toMatchObject({ allDay: true, date: '2026-11-02' });
    expect(r.events[1].endDate).toBeUndefined();
    expect(r.events[2].endDate).toBe('2026-11-21');
  });
  it('折り返し行・エスケープ・繰り返し・除外日', () => {
    const r = parseIcs(wrap(ev(['UID:d', 'SUMMARY:やすらぎの会\\, 定', ' 例会', 'DTSTART:20261113T130000', 'RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=4', 'EXDATE:20261120T130000'])));
    expect(r.events[0].title).toBe('やすらぎの会, 定例会');
    expect(r.events[0].repeat).toEqual({ freq: 'weekly', interval: 1, count: 4 });
    expect(r.events[0].exdates).toEqual(['2026-11-20']);
  });
  it('対応できない繰り返し・名前なしは飛ばして数える', () => {
    const r = parseIcs(wrap(
      ev(['SUMMARY:第2火曜', 'DTSTART:20261110T100000', 'RRULE:FREQ=MONTHLY;BYDAY=2TU']) + ev(['DTSTART:20261110T100000']) + ev(['SUMMARY:ok', 'DTSTART:20261110T100000']),
    ));
    expect(r.events.length).toBe(1);
    expect(r.skipped).toBe(2);
  });
  it('書き出して読み直すと同じ（スキーマにも通る）', () => {
    const src = [
      { uid: 'x1', title: '🚗仕事', date: '2026-10-29', allDay: true },
      { uid: 'x2', title: '整体', date: '2026-11-05', allDay: false, startTime: '17:30' },
    ] as const;
    const back = parseIcs(toIcs(src.map((e) => ({ ...e }))));
    expect(back.events.map((e) => [e.uid, e.title, e.date, e.allDay, e.startTime])).toEqual([['x1', '🚗仕事', '2026-10-29', true, undefined], ['x2', '整体', '2026-11-05', false, '17:30']]);
    for (const e of back.events) expect(() => EventSchema.parse({ ...e, id: 'i', createdAt: 1, updatedAt: 1 })).not.toThrow();
  });
});

describe('予定の色', () => {
  it('色を書き出して読み直せる。知らない色は無視', () => {
    const back = parseIcs(toIcs([{ uid: 'c1', title: 'a', date: '2026-11-01', allDay: true, color: 'pink' }]));
    expect(back.events[0].color).toBe('pink');
    const bad = parseIcs(wrap(ev(['SUMMARY:x', 'DTSTART:20261101T100000', 'X-BUHILOG-COLOR:neon'])));
    expect(bad.events[0].color).toBeUndefined();
  });
});
