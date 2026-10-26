import { eventsInRange, eventsOn, occurrenceStarts, timeLabel, weekdayOf, daysBetween } from '../src/domain/schedule';
import type { CalendarEvent, Repeat } from '../src/domain/types';

const ev = (date: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ id: date + (extra.title ?? ''), title: '予定', date, allDay: false, createdAt: 0, updatedAt: 0, ...extra });
const rep = (r: Partial<Repeat> & Pick<Repeat, 'freq'>): Repeat => ({ interval: 1, ...r });

describe('日付の計算', () => {
  it('曜日と日数（月またぎ・うるう年）', () => {
    expect(weekdayOf('2026-10-26')).toBe(1); // 月曜
    expect(weekdayOf('2026-10-25')).toBe(0);
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3);
    expect(daysBetween('2024-02-27', '2024-03-02')).toBe(4);
  });
});

describe('occurrenceStarts（繰り返し）', () => {
  it('繰り返しなしは1回。範囲外・除外日は含めない', () => {
    expect(occurrenceStarts(ev('2026-11-01'), '2026-12-31')).toEqual(['2026-11-01']);
    expect(occurrenceStarts(ev('2026-11-01'), '2026-10-31')).toEqual([]);
    expect(occurrenceStarts(ev('2026-11-01', { exdates: ['2026-11-01'] }), '2026-12-31')).toEqual([]);
  });
  it('毎日（間隔・終了日）', () => {
    expect(occurrenceStarts(ev('2026-11-01', { repeat: rep({ freq: 'daily', interval: 2, until: '2026-11-07' }) }), '2026-12-31'))
      .toEqual(['2026-11-01', '2026-11-03', '2026-11-05', '2026-11-07']);
  });
  it('毎週（曜日の指定）。開始日より前の曜日は出ない。2週おきも', () => {
    // 2026-11-04(水)から、毎週 月・水・金
    const e = ev('2026-11-04', { repeat: rep({ freq: 'weekly', weekdays: [1, 3, 5] }) });
    expect(occurrenceStarts(e, '2026-11-13')).toEqual(['2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13']);
    const biweekly = ev('2026-11-02', { repeat: rep({ freq: 'weekly', interval: 2 }) }); // 月曜、2週おき
    expect(occurrenceStarts(biweekly, '2026-12-31')).toEqual(['2026-11-02', '2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28']);
    // 曜日指定なしなら、開始日の曜日
    expect(occurrenceStarts(ev('2026-11-04', { repeat: rep({ freq: 'weekly' }) }), '2026-11-19')).toEqual(['2026-11-04', '2026-11-11', '2026-11-18']);
  });
  it('毎月: 31日は、31日のある月だけ。月またぎ・年またぎ', () => {
    const e = ev('2026-10-31', { repeat: rep({ freq: 'monthly' }) });
    expect(occurrenceStarts(e, '2027-02-28')).toEqual(['2026-10-31', '2026-12-31', '2027-01-31']);
    expect(occurrenceStarts(ev('2026-11-15', { repeat: rep({ freq: 'monthly' }) }), '2027-02-20')).toEqual(['2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15']);
  });
  it('毎年: 2月29日は、うるう年だけ', () => {
    expect(occurrenceStarts(ev('2024-02-29', { repeat: rep({ freq: 'yearly' }) }), '2029-12-31')).toEqual(['2024-02-29', '2028-02-29']);
    expect(occurrenceStarts(ev('2026-03-10', { repeat: rep({ freq: 'yearly' }) }), '2028-12-31')).toEqual(['2026-03-10', '2027-03-10', '2028-03-10']);
  });
  it('回数の上限と、除外日（除いても回数は変わらない）', () => {
    const e = ev('2026-11-01', { repeat: rep({ freq: 'daily', count: 3 }), exdates: ['2026-11-02'] });
    expect(occurrenceStarts(e, '2026-12-31')).toEqual(['2026-11-01', '2026-11-03']);
  });
});

describe('eventsOn / eventsInRange', () => {
  it('複数日の予定は、各日に出て「何日目」が分かる', () => {
    const e = ev('2026-11-10', { title: '旅行', allDay: true, endDate: '2026-11-12' });
    expect(eventsOn([e], '2026-11-09')).toEqual([]);
    const mid = eventsOn([e], '2026-11-11');
    expect(mid).toHaveLength(1);
    expect([mid[0].dayNo, mid[0].totalDays]).toEqual([2, 3]);
    expect(timeLabel(mid[0])).toBe('終日（2日目/3日間）');
    expect(eventsOn([e], '2026-11-13')).toEqual([]);
  });
  it('並びは、終日 → 時刻順 → 時間未定', () => {
    const list = [
      ev('2026-11-10', { title: 'C', startTime: '13:00', endTime: '14:00' }),
      ev('2026-11-10', { title: 'D' }),
      ev('2026-11-10', { title: 'A', allDay: true }),
      ev('2026-11-10', { title: 'B', startTime: '09:00' }),
    ];
    expect(eventsOn(list, '2026-11-10').map((o) => o.event.title)).toEqual(['A', 'B', 'C', 'D']);
    expect(eventsOn(list, '2026-11-10').map(timeLabel)).toEqual(['終日', '09:00〜', '13:00〜14:00', '時間未定']);
  });
  it('繰り返しの予定は、月の範囲に正しく展開され、除外日は出ない', () => {
    const e = ev('2026-11-02', { title: '通院', repeat: rep({ freq: 'weekly' }), exdates: ['2026-11-16'] }); // 毎週月曜
    const m = eventsInRange([e], '2026-11-01', '2026-11-30');
    expect([...m.keys()].sort()).toEqual(['2026-11-02', '2026-11-09', '2026-11-23', '2026-11-30']);
  });
});

import { doseOptionsFor } from '../src/domain/medications';
describe('トラゾドンの量', () => {
  it('分数の量も選べて、他の薬は増えない', () => {
    expect(doseOptionsFor('トラゾドン')).toEqual([0, 6.25, 8.33, 12.5, 25, 31.25, 33.33, 37.5, 50]);
    expect(doseOptionsFor('セルトラリン')).toEqual([0, 12.5, 25, 37.5, 50]);
  });
});
