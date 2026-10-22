import { MIN_NUMERIC_DAYS, rankFactors, spearman, candidateSentence } from '../src/domain/correlation';
import { addDays } from '../src/domain/date';
import type { Approach, DailyEntry } from '../src/domain/types';

const END = '2026-06-30';
const P = 'p1';
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ap = (id: string, name: string, extra: Partial<Approach> = {}): Approach => ({ id, name, linkedProblemIds: [P], createdAt: 0, updatedAt: 0, ...extra });

/** 56日分の合成データ: yoga(した日は高い=良い), drink(飲む日は低い=悪い), noise(無関係), sleepHours(長いほど高い) */
function dataset(days = 56): { entries: DailyEntry[]; approaches: Approach[] } {
  const approaches = [
    ap('yoga', '朝ヨガ'),
    ap('drink', '前日にお酒を飲んだ', { quantity: { unit: '杯', mode: 'select', max: 10 } }),
    ap('noise', '無関係な習慣'),
    ap('rare', 'めったにしない', { }),
  ];
  const entries: DailyEntry[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(END, -(days - 1 - i));
    const yoga = i % 2 === 0, drink = i % 5 === 0, noise = rnd() > 0.5;
    const hours = 5 + rnd() * 4;
    let y = 3 + (yoga ? 1 : -1) * 1 + (drink ? -1.5 : 0.3) + (hours - 7) * 0.5 + (rnd() - 0.5) * 0.6;
    y = Math.max(1, Math.min(5, Math.round(y)));
    entries.push({
      id: `e${i}`, localDate: date, problemRatings: { [P]: y }, problemNotes: {},
      approachStatuses: { yoga: yoga ? 'done' : 'not_done', drink: drink ? 'done' : 'not_done', noise: noise ? 'done' : 'not_done', rare: i === 3 ? 'done' : 'not_done' },
      approachQuantities: drink ? { drink: 1 + (i % 4) } : undefined,
      sleepHours: Math.round(hours * 2) / 2, createdAt: 0, updatedAt: 0,
    });
  }
  return { entries, approaches };
}

describe('spearman', () => {
  it('単調な関係は±1、無関係はほぼ0、全日同じ値は比べない', () => {
    expect(spearman([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12])?.rho).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1])?.rho).toBeCloseTo(-1);
    expect(spearman([1, 1, 1, 1, 1, 1], [1, 2, 3, 4, 5, 6])).toBeNull();
    expect(spearman([1, 2, 3], [1, 2, 3])).toBeNull(); // 少なすぎる
  });
});

describe('rankFactors', () => {
  it('強い関連のある要因が上位に来て、向き（良い側/悪い側）が分かる。無関係・データ不足の要因は上位に出ない', () => {
    const { entries, approaches } = dataset();
    const r = rankFactors(entries, approaches, P, END, 56);
    const names = r.top.map((c) => c.name);
    // 上位3つは、作り込んだ関連（ヨガ・お酒・睡眠時間）。お酒は「実施有無」か「量」の強いほうが1つ出る
    expect(r.top.slice(0, 3).map((c) => c.key.slice(2))).toEqual(expect.arrayContaining(['yoga', 'drink', 'hours']));
    const yoga = r.all.find((c) => c.key === 'a:yoga')!;
    expect(yoga.positive).toBe(true);
    expect(candidateSentence(yoga)).toBe('実施した日は、調子が高め（良い）傾向');
    const drink = r.all.find((c) => c.key.endsWith(':drink'))!;
    expect(drink.positive).toBe(false);
    expect(candidateSentence(drink)).toContain('調子が低め（悪い）');
    const sleep = r.all.find((c) => c.key === 's:hours')!;
    expect(candidateSentence(sleep)).toBe('睡眠時間が長い日ほど、調子が高め（良い）傾向');
    expect(names).not.toContain('めったにしない'); // 実施した日が1日だけ → 比べられない
    expect(r.top.length).toBeLessThanOrEqual(5);
    expect(r.ratedDays).toBe(56);
  });

  it('同じ試したことの「実施有無」と「量」は、強いほう1つだけ', () => {
    const { entries, approaches } = dataset();
    const r = rankFactors(entries, approaches, P, END, 56);
    expect(r.all.filter((c) => c.key.slice(2) === 'drink')).toHaveLength(1);
  });

  it('確からしさの順に並び、強い手がかりには有力の印、無関係は弱い手がかり', () => {
    const { entries, approaches } = dataset();
    const r = rankFactors(entries, approaches, P, END, 56);
    for (let i = 1; i < r.all.length; i++) expect(r.all[i].p).toBeGreaterThanOrEqual(r.all[i - 1].p);
    expect(r.all.find((c) => c.key === 'a:yoga')!.evidence).toBe('likely');
    const noise = r.all.find((c) => c.key === 'a:noise')!;
    expect(noise.evidence).not.toBe('likely');
  });

  it('日数が足りない期間では、数値の要因も実施有無も出さない（偶然を重要に見せない）', () => {
    const { entries, approaches } = dataset();
    const r = rankFactors(entries, approaches, P, END, 7); // 直近7日
    expect(r.ratedDays).toBe(7);
    expect(r.all).toEqual([]); // 数値は14日未満、実施/非実施も各5日に満たない
    expect(MIN_NUMERIC_DAYS).toBe(14);
  });

  it('評価が未入力の日は使わない。別の困りごとの点数は混ざらない', () => {
    const { entries, approaches } = dataset();
    const cut = entries.map((e, i) => (i % 2 ? { ...e, problemRatings: {} } : e));
    const r = rankFactors(cut, approaches, P, END, 56);
    expect(r.ratedDays).toBe(28);
    expect(rankFactors(entries, approaches, 'other', END, 56).all).toEqual([]);
  });

  it('量は、実施した日が少なすぎると候補にしない', () => {
    const { entries, approaches } = dataset();
    const few = entries.map((e) => ({ ...e, approachStatuses: { ...e.approachStatuses, drink: 'not_done' as const }, approachQuantities: undefined }));
    const r = rankFactors(few, approaches, P, END, 56);
    expect(r.all.find((c) => c.key === 'q:drink')).toBeUndefined();
  });
});
