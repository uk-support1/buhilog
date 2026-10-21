import { buildSeries, compareApproach } from '../src/domain/analytics';
import type { DailyEntry } from '../src/domain/types';

const P = 'p1', A = 'a1';
let i = 0;
const entry = (localDate: string, rating: number | null | undefined, status?: 'done' | 'not_done' | 'unknown'): DailyEntry => ({
  id: `e${i++}`, localDate,
  problemRatings: rating === undefined ? {} : { [P]: rating },
  problemNotes: {}, approachStatuses: status ? { [A]: status } : {}, createdAt: 0, updatedAt: 0,
});
const day = (n: number) => `2026-05-${String(n).padStart(2, '0')}`;
const END = day(28);

describe('buildSeries', () => {
  it('欠損を0や補間にせず、記録日数と欠損日数を数える', () => {
    const s = buildSeries([entry(day(28), 0), entry(day(26), 6), entry(day(25), null)], P, END, 7);
    expect(s.days).toHaveLength(7);
    expect(s.days[6].rating).toBe(0);
    expect(s.days[5].rating).toBeNull();
    expect(s.days[4].rating).toBe(6);
    expect(s.recorded).toBe(2);
    expect(s.missing).toBe(5);
    expect(s.weeks[0]).toMatchObject({ mean: 3, n: 2 });
  });
  it('記録なしの週は平均null', () => {
    const s = buildSeries([], P, END, 14);
    expect(s.weeks).toHaveLength(2);
    expect(s.weeks[0].mean).toBeNull();
  });
  it('56日窓は8週', () => {
    expect(buildSeries([], P, END, 56).weeks).toHaveLength(8);
  });
});

describe('compareApproach', () => {
  it('仕様フィクスチャ: 実施[2,4] 非実施[5,7] → 差-3、参考表示', () => {
    const es = [entry(day(1), 2, 'done'), entry(day(2), 4, 'done'), entry(day(3), 5, 'not_done'), entry(day(4), 7, 'not_done')];
    const c = compareApproach(es, P, A, END, 28);
    expect(c.meanDone).toBe(3);
    expect(c.meanNotDone).toBe(6);
    expect(c.difference).toBe(-3);
    expect(c.status).toBe('reference');
    expect(c.needMoreDone).toBe(3);
    expect(c.needMoreNotDone).toBe(3);
  });
  it('片方0日は比較不可', () => {
    const c = compareApproach([entry(day(1), 2, 'done')], P, A, END, 28);
    expect(c.status).toBe('impossible');
    expect(c.difference).toBeNull();
    expect(c.needMoreNotDone).toBe(5);
  });
  it('両群5日以上で探索表示、SD計算', () => {
    const es = [1, 2, 3, 4, 5].map((n) => entry(day(n), 2, 'done')).concat([6, 7, 8, 9, 10].map((n) => entry(day(n), 4, 'not_done')));
    const c = compareApproach(es, P, A, END, 28);
    expect(c.status).toBe('exploratory');
    expect(c.difference).toBe(-2);
    expect(c.sdDone).toBe(0);
    expect(c.imbalance).toBe(false);
  });
  it('未回答・未入力・未記録は除外し、0点は含める', () => {
    const es = [entry(day(1), 0, 'done'), entry(day(2), 5, 'unknown'), entry(day(3), null, 'done'), entry(day(4), 3), entry(day(5), 4, 'not_done')];
    const c = compareApproach(es, P, A, END, 28);
    expect(c.nDone).toBe(1);
    expect(c.meanDone).toBe(0);
    expect(c.nNotDone).toBe(1);
    expect(c.excludedUnknown).toBe(2);
    expect(c.excludedNoRating).toBe(1);
  });
  it('件数の偏りを検出', () => {
    const es = Array.from({ length: 15 }, (_, k) => entry(day(k + 1), 3, 'done')).concat([entry(day(20), 5, 'not_done')]);
    expect(compareApproach(es, P, A, END, 28).imbalance).toBe(true);
  });
  it('期間外の記録は含めない', () => {
    const es = [entry(day(1), 2, 'done'), entry(day(27), 4, 'not_done')];
    const c = compareApproach(es, P, A, END, 7);
    expect(c.nDone).toBe(0);
    expect(c.nNotDone).toBe(1);
  });
  it('全日未回答でも壊れない', () => {
    const c = compareApproach([entry(day(1), 3, 'unknown')], P, A, END, 28);
    expect(c.status).toBe('impossible');
    expect(c.meanDone).toBeNull();
  });
});
