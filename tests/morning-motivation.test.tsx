import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dexie from 'dexie';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { ensureMorningMotivation, MORNING_MOTIVATION } from '../src/domain/dayFactors';
import { Manage } from '../src/features/Manage';

describe('朝要因：出社前の活動（やる気）', () => {
  it('5段階の項目を足す。何度実行しても1つだけ', () => {
    const a = ensureMorningMotivation([], () => 'x', 1);
    expect(a.problems).toHaveLength(1);
    expect(a.problems[0]).toMatchObject({ name: MORNING_MOTIVATION.name, group: '朝要因', asFactor: true });
    const b = ensureMorningMotivation(a.problems, () => 'y', 2);
    expect(b.changed).toBe(false);
    expect(b.problems).toHaveLength(1);
  });
  it('旧いDBを開くと項目が足され、ほかの項目は変わらない', async () => {
    const legacy = new Dexie('legacy-v7');
    const stores = { problems: 'id, order, archivedAt', approaches: 'id, archivedAt', dailyEntries: 'id, &localDate', settings: 'key', medications: 'id, order, archivedAt', events: 'id, date' };
    [1, 2, 3, 4, 5, 6, 7].forEach((v) => legacy.version(v).stores(stores));
    await legacy.table('problems').add({ id: 'p0', name: '頭痛', order: 0, group: '困りごと', createdAt: 0, updatedAt: 0 });
    await legacy.table('settings').add({ key: 'app', schemaVersion: 7, onboardingCompleted: true, backupReminderDays: 14 });
    legacy.close();
    const repo = createRepo(new BuhiLogDB('legacy-v7'));
    const ps = await repo.listProblems(true);
    expect(ps.map((p) => p.name)).toEqual(['頭痛', MORNING_MOTIVATION.name, '朝の耳鳴り']); // 朝の耳鳴りは v14 で、睡眠の質がなければ最後に足される
    expect(ps[1]).toMatchObject({ group: '朝要因', asFactor: true });
  });
});

describe('困りごとを、選んだ項目の下に追加', () => {
  it('同じグループ・小見出しで直後に入り、並びが振り直される', async () => {
    const repo = createRepo(new BuhiLogDB('after1'));
    const a = await repo.addProblem('A', undefined, '人との関係', '家族');
    await repo.addProblem('B', undefined, '人との関係', '家族');
    const c = await repo.addProblem('Aの足', undefined, undefined, undefined, { afterId: a.id });
    expect(c).toMatchObject({ group: '人との関係', section: '家族', order: 1 });
    expect((await repo.listProblems()).map((p) => p.name)).toEqual(['A', 'Aの足', 'B']);
  });
  it('管理画面から、選んだ項目の下に追加できる', async () => {
    const user = userEvent.setup();
    const repo = createRepo(new BuhiLogDB('after2'));
    const a = await repo.addProblem('A', undefined, '人との関係');
    await repo.addProblem('B', undefined, '人との関係');
    render(<Manage repo={repo} />);
    await screen.findAllByRole('option', { name: /Aの下/ });
    await user.type(screen.getByLabelText('新しい困りごと'), 'Aの足');
    await user.selectOptions(screen.getByLabelText('この項目の下に入れる'), a.id);
    await user.click(within(screen.getByLabelText('新しい困りごと').closest('form')!).getByRole('button', { name: '追加' }));
    await waitFor(async () => expect((await repo.listProblems()).map((p) => p.name)).toEqual(['A', 'Aの足', 'B']));
  });
});

import { ensureMotivationActions, MOTIVATION_ACTIONS } from '../src/domain/dayFactors';
import { Today } from '../src/features/Today';

describe('出社前の活動（やる気）の下の「実施したか」', () => {
  it('3つの項目を、やる気の項目のすぐ下に足す。何度実行しても同じ。やる気の項目がなければ何もしない', () => {
    const p = ensureMorningMotivation([], () => 'pid', 1).problems;
    const a = ensureMotivationActions(p, [], (() => { let n = 0; return () => `a${++n}`; })(), 5);
    expect(a.approaches.map((x) => x.name)).toEqual([...MOTIVATION_ACTIONS]);
    expect(a.approaches.every((x) => x.underProblemId === 'pid' && x.linkedProblemIds[0] === 'pid' && x.group === '朝要因')).toBe(true);
    expect(ensureMotivationActions(p, a.approaches, () => 'z', 6).changed).toBe(false);
    expect(ensureMotivationActions([], [], () => 'z', 6).changed).toBe(false);
  });
  it('旧いDBを開くと項目が足される', async () => {
    const legacy = new Dexie('legacy-v10');
    const stores = { problems: 'id, order, archivedAt', approaches: 'id, archivedAt', dailyEntries: 'id, &localDate', settings: 'key', medications: 'id, order, archivedAt', events: 'id, date', todos: 'id, list, order' };
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((v) => legacy.version(v).stores(stores));
    await legacy.table('problems').add({ id: 'pm', name: '出社前の活動（やる気）', order: 0, group: '朝要因', asFactor: true, createdAt: 0, updatedAt: 0 });
    await legacy.table('settings').add({ key: 'app', schemaVersion: 10, onboardingCompleted: true, backupReminderDays: 14 });
    legacy.close();
    const repo = createRepo(new BuhiLogDB('legacy-v10'));
    const as = await repo.listApproaches();
    expect(as.map((x) => x.name)).toEqual([...MOTIVATION_ACTIONS]);
    expect(as.every((x) => x.underProblemId === 'pm')).toBe(true);
  });
  it('旧い版で足した項目にも、「3以下のときだけ出す」が付く', () => {
    const p = ensureMorningMotivation([], () => 'pid', 1).problems;
    const old = ensureMotivationActions(p, [], () => 'x' + Math.random(), 5).approaches.map((a) => { const { visibleWhenRatingAtMost: _v, ...rest } = a; return rest; });
    const r = ensureMotivationActions(p, old as never, () => 'y', 9);
    expect(r.changed).toBe(true);
    expect(r.approaches.every((a) => a.visibleWhenRatingAtMost === 3)).toBe(true);
    expect(r.approaches).toHaveLength(3);
  });
  it('今日の画面では、やる気が3以下のときだけ「実施した／実施しなかった」が出る。記録済みなら隠れない。入力済みの数も、出ているものだけ', async () => {
    const user = userEvent.setup();
    const repo = createRepo(new BuhiLogDB('motivation-ui'));
    const p = await repo.addProblem('出社前の活動（やる気）', undefined, '朝要因');
    const x = await repo.addApproach("B'zの動画をみる", [], undefined, undefined, undefined, { underProblemId: p.id, doneLabel: '実施した', notDoneLabel: '実施しなかった' });
    await repo.updateApproach(x.id, { visibleWhenRatingAtMost: 3 } as never);
    render(<Today repo={repo} initialDate="2026-11-18" />);
    await user.click(await screen.findByRole('tab', { name: /朝要因/ }));
    const rating = await screen.findByRole('radiogroup', { name: '出社前の活動（やる気）の調子' });
    expect(screen.queryByRole('radiogroup', { name: "B'zの動画をみる" })).toBeNull(); // 点数が未入力なら出ない
    expect(screen.getByRole('tab', { name: /朝要因0\/1/ })).toBeInTheDocument(); // 隠れている項目は、数に入らない
    await user.click(within(rating).getByRole('radio', { name: '4' }));
    expect(screen.queryByRole('radiogroup', { name: "B'zの動画をみる" })).toBeNull();
    await user.click(within(rating).getByRole('radio', { name: '3' }));
    const g = await screen.findByRole('radiogroup', { name: "B'zの動画をみる" });
    expect(screen.getByRole('tab', { name: /朝要因1\/2/ })).toBeInTheDocument();
    await user.click(within(g).getByRole('radio', { name: '実施した' }));
    await user.click(within(rating).getByRole('radio', { name: '5' })); // 点数が上がっても、記録した項目は隠れない
    expect(screen.getByRole('radiogroup', { name: "B'zの動画をみる" })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(async () => expect(Object.values((await repo.getEntry('2026-11-18'))?.approachStatuses ?? {})).toEqual(['done']));
  });
});
