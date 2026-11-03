import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { applyV9 } from '../src/domain/v9';
import { rankFactors } from '../src/domain/correlation';
import { Today } from '../src/features/Today';
import type { Approach, DailyEntry, Problem } from '../src/domain/types';

let n = 0;
const nid = () => `n${++n}`;
const ap = (id: string, name: string, group: string, extra: Partial<Approach> = {}): Approach =>
  ({ id, name, group, linkedProblemIds: [], createdAt: 10, updatedAt: 0, ...extra });
const pr = (id: string, name: string, extra: Partial<Problem> = {}): Problem => ({ id, name, order: 0, createdAt: 0, updatedAt: 0, ...extra });
const en = (d: string, e: Partial<DailyEntry>): DailyEntry => ({ id: `e${d}`, localDate: d, problemRatings: {}, problemNotes: {}, approachStatuses: {}, createdAt: 0, updatedAt: 0, ...e });

describe('v9 の整え', () => {
  const approaches = [
    ap('s', '寝る前1時間スマホを見ない', '前夜要因'),
    ap('o', '前日にお酒を飲んだ', '前夜要因', { quantity: { unit: '杯', mode: 'select', max: 10 } }),
    ap('l', '足・肩', '運動要因', { quantity: { unit: '回', mode: 'number' } }),
    ap('x', 'その他筋トレ', '運動要因', { quantity: { unit: '回', mode: 'number' } }),
    ap('u', '腕立', '運動要因', { quantity: { unit: '回', mode: 'number' } }),
  ];
  const problems = [pr('m', 'マルチタスクをやらない', { group: '日中要因', asFactor: true }), pr('g', '背筋の伸び', { group: 'いきいきサイン' })];
  const entries = [
    en('2026-05-01', { problemRatings: { m: 4 }, approachStatuses: { l: 'done', u: 'done' }, approachQuantities: { l: 30 } }),
    en('2026-05-02', { problemRatings: { m: 1 }, approachStatuses: { l: 'not_done' } }),
  ];
  const r = applyV9({ problems, approaches, entries, groupOrder: ['前夜要因', 'いきいきサイン'] }, nid, 7);

  it('ボタンの名前・筋肉痛・メモ欄・グループ名', () => {
    const by = (name: string) => r.approaches.find((a) => a.name === name)!;
    expect(by('寝る前1時間スマホを見ない')).toMatchObject({ doneLabel: 'スマホを見なかった', notDoneLabel: 'スマホを見た' });
    expect(by('前日にお酒を飲んだ')).toMatchObject({ doneLabel: '飲んだ', notDoneLabel: '飲んでない' });
    expect(by('腕立').sore).toBe(true);
    expect(by('その他筋トレ')).toMatchObject({ sore: true, noteLabel: expect.stringContaining('筋トレ') });
    expect(by('その他筋トレ').quantity).toBeUndefined();
    expect(by('腕立').noteLabel).toBeUndefined();
    expect(r.problems.find((p) => p.id === 'g')?.group).toBe('生き生き');
    expect(r.groupOrder).toEqual(['前夜要因', '生き生き']);
  });
  it('足・肩を足と肩に分け、過去の記録は両方に写す', () => {
    const leg = r.approaches.find((a) => a.name === '足')!;
    const sh = r.approaches.find((a) => a.name === '肩')!;
    expect(r.approaches.some((a) => a.name === '足・肩')).toBe(false);
    expect(sh).toMatchObject({ group: '運動要因', quantity: { unit: '回' }, sore: true });
    expect(r.entries[0].approachStatuses).toMatchObject({ [leg.id]: 'done', [sh.id]: 'done', u: 'done' });
    expect(r.entries[0].approachQuantities).toMatchObject({ [leg.id]: 30, [sh.id]: 30 });
    expect(r.entries[1].approachStatuses[sh.id]).toBe('not_done');
  });
  it('マルチタスクは名前と向きを変え、過去の点数を反転する', () => {
    const m = r.problems.find((p) => p.id === 'm')!;
    expect(m).toMatchObject({ name: 'マルチタスク', reverse: true });
    expect(m.description).toContain('5＝やってしまった');
    expect(r.entries.map((e) => e.problemRatings.m)).toEqual([2, 5]);
  });
  it('2回実行しても同じ（反転が二重にならない）', () => {
    const again = applyV9(r, nid, 8);
    expect(again.changed).toBe(false);
    expect(again.entries.map((e) => e.problemRatings.m)).toEqual([2, 5]);
    expect(again.approaches.filter((a) => a.name === '肩')).toHaveLength(1);
  });
});

describe('マルチタスクの比べ方', () => {
  it('「やってしまった」(5)が多い日ほど調子が悪いなら、「マルチタスクの少なさ」が良い日ほど調子が良い（正の関係）として出る', () => {
    const rows = Array.from({ length: 20 }, (_, i) => {
      const multi = (i % 5) + 1;
      return en(`2026-05-${String(i + 1).padStart(2, '0')}`, { problemRatings: { t: 6 - multi, m: multi } });
    });
    const res = rankFactors(rows, [], 't', '2026-05-20', 28, [], [{ id: 'm', name: 'マルチタスク', group: '日中要因', reverse: true }]);
    const c = res.all.find((x) => x.name === 'マルチタスクの少なさ')!;
    expect(c.positive).toBe(true);
  });
});

describe('今日の画面: ボタンの名前・筋肉痛・メモ', () => {
  async function setup(name: string) {
    const repo = createRepo(new BuhiLogDB(name));
    const p = await repo.addProblem('頭痛', undefined, '困りごと');
    const phone = await repo.addApproach('寝る前1時間スマホを見ない', [p.id], undefined, '前夜要因');
    await repo.updateApproach(phone.id, { doneLabel: 'スマホを見なかった', notDoneLabel: 'スマホを見た' });
    const other = await repo.addApproach('その他筋トレ', [p.id], undefined, '運動要因');
    await repo.updateApproach(other.id, { sore: true, noteLabel: 'どんな筋トレをしたか（メモ）' });
    return { repo, phone, other };
  }
  it('ボタンに「スマホを見なかった／見た」が出る', async () => {
    const user = userEvent.setup();
    const { repo } = await setup('v9ui1');
    render(<Today repo={repo} initialDate="2026-11-03" />);
    await user.click(await screen.findByRole('tab', { name: /前夜要因/ }));
    const g = await screen.findByRole('radiogroup', { name: '寝る前1時間スマホを見ない' });
    expect(within(g).getByRole('radio', { name: 'スマホを見なかった' })).toBeInTheDocument();
    expect(within(g).getByRole('radio', { name: 'スマホを見た' })).toBeInTheDocument();
    expect(within(g).queryByRole('radio', { name: '実施した' })).toBeNull();
  });
  it('筋肉痛を選ぶと強さ(1〜5)が選べ、実施したを選ぶとメモ欄が出る。保存・復元できる', async () => {
    const user = userEvent.setup();
    const { repo, other } = await setup('v9ui2');
    render(<Today repo={repo} initialDate="2026-11-03" />);
    await user.click(await screen.findByRole('tab', { name: /運動要因/ }));
    const g = await screen.findByRole('radiogroup', { name: 'その他筋トレ' });
    expect(screen.queryByLabelText('その他筋トレのメモ')).toBeNull();
    await user.click(within(g).getByRole('radio', { name: '筋肉痛' }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'その他筋トレの筋肉痛の強さ' })).getByRole('radio', { name: '4' }));
    await user.click(screen.getByRole('button', { name: /保存/ }));
    const e = await repo.getEntry('2026-11-03');
    expect(e?.approachStatuses[other.id]).toBe('sore');
    expect(e?.approachSoreness).toEqual({ [other.id]: 4 });
    // 実施したに変えるとメモ欄が出て、強さは保存されない
    await user.click(within(g).getByRole('radio', { name: '実施した' }));
    await user.type(screen.getByLabelText('その他筋トレのメモ'), 'ダンベルプレス');
    await user.click(screen.getByRole('button', { name: /保存/ }));
    const e2 = await repo.getEntry('2026-11-03');
    expect(e2?.approachSoreness).toBeUndefined();
    expect(e2?.approachNotes).toEqual({ [other.id]: 'ダンベルプレス' });
  });
});
