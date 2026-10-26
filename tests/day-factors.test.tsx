import Dexie from 'dexie';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { parseBackup } from '../src/db/backup';
import { Today } from '../src/features/Today';
import { rankFactors } from '../src/domain/correlation';
import { addDays } from '../src/domain/date';
import { convertDayFactors } from '../src/domain/dayFactors';
import { buildNarrative } from '../src/domain/narrative';
import type { Approach, DailyEntry, Problem } from '../src/domain/types';

let n = 0;
const nid = () => `n${n++}`;
const ap = (id: string, name: string): Approach => ({ id, name, linkedProblemIds: [], group: '日中要因', createdAt: 0, updatedAt: 0 });
const en = (d: string, extra: Partial<DailyEntry>): DailyEntry => ({ id: d, localDate: d, problemRatings: {}, problemNotes: {}, approachStatuses: {}, createdAt: 0, updatedAt: 0, ...extra });

describe('convertDayFactors（日中要因の3項目を5段階へ）', () => {
  const problems: Problem[] = [{ id: 'p0', name: '頭痛', order: 0, group: '困りごと', createdAt: 0, updatedAt: 0 }];
  const approaches = [ap('m', 'マルチタスクをやらない'), ap('c', 'コミュニケーション量'), ap('h', '誰かの役に立つ'), ap('y', '朝ヨガ')];
  const entries = [
    en('2026-05-01', { approachStatuses: { m: 'done', y: 'done' } }),
    en('2026-05-02', { approachStatuses: { m: 'not_done' }, noteOther: '【マルチタスクをやらない】やりすぎ\n【服薬】前日: セルトラリン50' }),
    en('2026-05-03', { approachStatuses: { m: 'unknown' }, noteOther: '【マルチタスクをやらない】△' }),
    en('2026-05-04', { approachStatuses: { m: 'unknown' } }),
    en('2026-05-05', { approachStatuses: { c: 'done', h: 'not_done' }, noteOther: '【誰かの役に立つ】〇母を手伝った' }),
  ];

  it('実施→4、しなかった→1、△→2、未回答は未入力。旧項目はアーカイブし、メモは新しい項目に移す', () => {
    const r = convertDayFactors(problems, approaches, entries, nid, 5);
    const pid = (name: string) => r.problems.find((p) => p.name === name)!.id;
    const get = (d: string) => r.entries.find((e) => e.localDate === d)!;
    expect(get('2026-05-01').problemRatings[pid('マルチタスクをやらない')]).toBe(4);
    expect(get('2026-05-02').problemRatings[pid('マルチタスクをやらない')]).toBe(1);
    expect(get('2026-05-02').problemNotes[pid('マルチタスクをやらない')]).toBe('やりすぎ');
    expect(get('2026-05-03').problemRatings[pid('マルチタスクをやらない')]).toBe(2);
    expect(get('2026-05-04').problemRatings[pid('マルチタスクをやらない')]).toBeUndefined(); // 未回答は未入力
    expect(get('2026-05-05').problemRatings[pid('コミュニケーション量')]).toBe(4);
    expect(get('2026-05-05').problemRatings[pid('誰かの役に立つ')]).toBe(1);
    expect(get('2026-05-05').problemNotes[pid('誰かの役に立つ')]).toBe('母を手伝った');
    // 他のメモ（服薬）は残る。移した行は消える
    expect(get('2026-05-02').noteOther).toBe('【服薬】前日: セルトラリン50');
    expect(get('2026-05-03').noteOther).toBeUndefined();
    // 旧項目の実施状況は取り除き、旧項目自体はアーカイブ（削除しない）。ほかの項目は変えない
    expect(get('2026-05-01').approachStatuses).toEqual({ y: 'done' });
    expect(r.approaches.find((a) => a.id === 'm')?.archivedAt).toBe(5);
    expect(r.approaches.find((a) => a.id === 'y')?.archivedAt).toBeUndefined();
    // 新しい項目の設定
    const comm = r.problems.find((p) => p.name === 'コミュニケーション量')!;
    expect(comm).toMatchObject({ group: '日中要因', asFactor: true, noteAlways: true, noteLabel: 'メモ（あれば）' });
    const multi = r.problems.find((p) => p.name === 'マルチタスクをやらない')!;
    expect(multi.noteAlways).toBeUndefined();
    expect(multi.description).toContain('5＝');
    expect(r.problems.find((p) => p.id === 'p0')).toEqual(problems[0]);
  });

  it('何度実行しても同じ結果。旧項目がなければ何もしない', () => {
    const once = convertDayFactors(problems, approaches, entries, nid, 5);
    const twice = convertDayFactors(once.problems, once.approaches, once.entries, nid, 6);
    expect(twice.changed).toBe(false);
    expect(twice.entries).toEqual(once.entries);
    expect(twice.problems).toHaveLength(once.problems.length);
    expect(convertDayFactors(problems, [ap('y', '朝ヨガ')], entries, nid, 5).changed).toBe(false);
  });
});

describe('旧データの引き継ぎ（DB v4 → v5 / バックアップ）', () => {
  it('DBを開くと、日中要因の3項目が5段階になり、記録も変換される。ほかの記録は変わらない', async () => {
    const legacy = new Dexie('legacy-v5');
    const stores = { problems: 'id, order, archivedAt', approaches: 'id, archivedAt', dailyEntries: 'id, &localDate', settings: 'key' };
    [1, 2, 3, 4].forEach((v) => legacy.version(v).stores(stores));
    await legacy.table('problems').add({ id: 'p0', name: '頭痛', order: 0, group: '困りごと', createdAt: 0, updatedAt: 0 });
    await legacy.table('approaches').bulkAdd([ap('m', 'マルチタスクをやらない'), ap('y', '朝ヨガ')]);
    await legacy.table('dailyEntries').bulkAdd([
      en('2026-05-01', { problemRatings: { p0: 4 }, approachStatuses: { m: 'done', y: 'done' } }),
      en('2026-05-02', { problemRatings: { p0: 2 }, approachStatuses: { m: 'unknown', y: 'not_done' }, noteOther: '【マルチタスクをやらない】△' }),
    ]);
    await legacy.table('settings').add({ key: 'app', schemaVersion: 4, onboardingCompleted: true, backupReminderDays: 14 });
    legacy.close();
    const repo = createRepo(new BuhiLogDB('legacy-v5'));
    const ps = await repo.listProblems(true);
    const multi = ps.find((p) => p.name === 'マルチタスクをやらない')!;
    expect(multi).toMatchObject({ group: '日中要因', asFactor: true });
    const [e1, e2] = [await repo.getEntry('2026-05-01'), await repo.getEntry('2026-05-02')];
    expect(e1?.problemRatings).toEqual({ p0: 4, [multi.id]: 4 });
    expect(e2?.problemRatings).toEqual({ p0: 2, [multi.id]: 2 });
    expect(e1?.approachStatuses).toEqual({ y: 'done' }); // 朝ヨガは変わらない
    expect(e2?.approachStatuses).toEqual({ y: 'not_done' });
    expect((await repo.getSettings()).schemaVersion).toBe(6);
    expect((await repo.listApproaches(true)).find((a) => a.id === 'm')?.archivedAt).toBeTruthy();
  });

  it('旧いバックアップの読み込み時にも同じ変換が行われる', () => {
    const old = {
      formatVersion: 2, exportedAt: '2026-10-22T10:00:00Z',
      problems: [{ id: 'p0', name: '頭痛', order: 0, group: '困りごと', createdAt: 0, updatedAt: 0 }],
      approaches: [ap('m', 'マルチタスクをやらない')],
      dailyEntries: [en('2026-05-01', { problemRatings: { p0: 4 }, approachStatuses: { m: 'not_done' } })],
      settings: { schemaVersion: 4, onboardingCompleted: true, backupReminderDays: 14 },
    };
    const r = parseBackup(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const multi = r.backup.problems.find((p) => p.name === 'マルチタスクをやらない')!;
    expect(r.backup.dailyEntries[0].problemRatings[multi.id]).toBe(1);
    expect(r.backup.dailyEntries[0].approachStatuses).toEqual({});
  });
});

describe('今日の画面とふりかえり', () => {
  async function setup(name: string) {
    const repo = createRepo(new BuhiLogDB(name));
    const target = await repo.addProblem('頭痛', undefined, '困りごと');
    const mk = async (nm: string, desc: string, memo: boolean) => {
      const p = await repo.addProblem(nm, desc, '日中要因');
      await repo.updateProblem(p.id, { asFactor: true, ...(memo ? { noteLabel: 'メモ（あれば）', noteAlways: true } : {}) });
      return p;
    };
    const multi = await mk('マルチタスクをやらない', '5＝1つずつ集中できた 〜 1＝同時進行でバタバタ', false);
    const comm = await mk('コミュニケーション量', '5＝たっぷり交流できた 〜 1＝ほとんどなかった', true);
    const help = await mk('誰かの役に立つ', '5＝しっかり役に立てた 〜 1＝まったくなかった', true);
    return { repo, target, multi, comm, help };
  }

  it('3項目が5段階で入力でき、コミュニケーションと誰かの役に立つにはメモ欄がいつも見える', async () => {
    const { repo, multi, comm, help } = await setup('df1');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-08-01" />);
    await user.click(await screen.findByRole('tab', { name: /日中要因/ }));
    expect(screen.getByLabelText('コミュニケーション量のメモ（あれば）')).toBeVisible();
    expect(screen.getByLabelText('誰かの役に立つのメモ（あれば）')).toBeVisible();
    expect(screen.queryByLabelText('マルチタスクをやらないのメモ（あれば）')).toBeNull(); // マルチタスクにはメモ欄を常時は出さない
    const pick = (name: string, i: number) => user.click(screen.getByRole('radiogroup', { name: `${name}の調子` }).querySelectorAll('button')[i]!);
    await pick('マルチタスクをやらない', 2); // 3
    await pick('コミュニケーション量', 4); // 5
    await pick('誰かの役に立つ', 3); // 4
    await user.type(screen.getByLabelText('コミュニケーション量のメモ（あれば）'), '友人と電話');
    await user.type(screen.getByLabelText('誰かの役に立つのメモ（あれば）'), '母の買い物を手伝った');
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    const e = await repo.getEntry('2026-08-01');
    expect(e?.problemRatings).toMatchObject({ [multi.id]: 3, [comm.id]: 5, [help.id]: 4 });
    expect(e?.problemNotes).toMatchObject({ [comm.id]: '友人と電話', [help.id]: '母の買い物を手伝った' });
  });

  it('5段階の3項目は、ほかの困りごとの「関連がありそうな要因」にも入る', async () => {
    const { repo, target, comm } = await setup('df2');
    const today = '2026-09-30';
    const rows: DailyEntry[] = Array.from({ length: 40 }, (_, i) => {
      const c = 1 + (i % 5);
      return en(addDays(today, -i), { problemRatings: { [target.id]: Math.max(1, Math.min(5, c)), [comm.id]: c } });
    });
    const ps = await repo.listProblems();
    const r = rankFactors(rows, [], target.id, today, 56, [], ps.filter((p) => p.asFactor).map((p) => ({ id: p.id, name: p.name, group: p.group })));
    const cand = r.all.find((x) => x.key === `f:${comm.id}`)!;
    expect(cand).toMatchObject({ kind: 'rated', positive: true });
    expect(buildNarrative('頭痛', cand).headline).toContain('「コミュニケーション量」が良い状態の日ほど、「頭痛」の調子');
    expect(buildNarrative('頭痛', cand).reasons.join('')).toContain('人と話すこと');
    expect(r.all.some((x) => x.key === `f:${target.id}`)).toBe(false); // 選んだ困りごと自身は除く
    expect(buildNarrative('頭痛', { ...cand, positive: false, rho: -0.4 }).tip).toContain('自分のペース'); // 「減らす」提案はしない
  });
});
