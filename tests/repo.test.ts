import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';

let n = 0;
const fresh = () => { const db = new BuhiLogDB(`t${n++}`); return { db, repo: createRepo(db) }; };
const base = { problemRatings: {}, problemNotes: {}, approachStatuses: {} };

describe('repo', () => {
  it('未入力(null)と点数を区別して保存する', async () => {
    const { repo } = fresh();
    const p1 = await repo.addProblem('痛み');
    const p2 = await repo.addProblem('不眠');
    await repo.saveEntry({ ...base, localDate: '2026-05-01', problemRatings: { [p1.id]: 5, [p2.id]: null } });
    const e = await repo.getEntry('2026-05-01');
    expect(e?.problemRatings[p1.id]).toBe(5);
    expect(e?.problemRatings[p2.id]).toBeNull();
  });

  it('同日の保存は上書き更新で重複しない', async () => {
    const { repo } = fresh();
    const a = await repo.saveEntry({ ...base, localDate: '2026-05-01', noteOther: '1回目' });
    const b = await repo.saveEntry({ ...base, localDate: '2026-05-01', noteOther: '2回目' });
    expect(b.id).toBe(a.id);
    expect(b.createdAt).toBe(a.createdAt);
    expect(await repo.listEntries()).toHaveLength(1);
    expect((await repo.getEntry('2026-05-01'))?.noteOther).toBe('2回目');
  });

  it('同日の同時保存でも1件', async () => {
    const { repo } = fresh();
    await Promise.all([1, 2, 3].map((i) => repo.saveEntry({ ...base, localDate: '2026-05-02', noteOther: String(i) })));
    expect(await repo.listEntries()).toHaveLength(1);
  });

  it('範囲外・不正値は拒否する', async () => {
    const { repo } = fresh();
    await expect(repo.saveEntry({ ...base, localDate: '2026-05-01', problemRatings: { x: 6 } })).rejects.toThrow();
    await expect(repo.saveEntry({ ...base, localDate: '2026-05-01', problemRatings: { x: 0 } })).rejects.toThrow(); // 困りごとは1〜5
    await expect(repo.saveEntry({ ...base, localDate: '2026-05-01', problemRatings: { x: 2.5 } })).rejects.toThrow();
    await expect(repo.saveEntry({ ...base, localDate: '2026-02-30' })).rejects.toThrow();
    await expect(repo.saveEntry({ ...base, localDate: '2026-05-01', sleepHours: 30 })).rejects.toThrow();
    await expect(repo.addProblem('   ')).rejects.toThrow();
  });

  it('アーカイブしても過去の記録は残り、復元できる', async () => {
    const { repo } = fresh();
    const p = await repo.addProblem('痛み');
    const a = await repo.addApproach('ストレッチ', [p.id]);
    await repo.saveEntry({ ...base, localDate: '2026-05-01', problemRatings: { [p.id]: 4 }, approachStatuses: { [a.id]: 'done' } });
    await repo.setProblemArchived(p.id, true);
    await repo.setApproachArchived(a.id, true);
    expect(await repo.listProblems()).toHaveLength(0);
    expect(await repo.listProblems(true)).toHaveLength(1);
    const e = await repo.getEntry('2026-05-01');
    expect(e?.problemRatings[p.id]).toBe(4);
    expect(e?.approachStatuses[a.id]).toBe('done');
    await repo.setProblemArchived(p.id, false);
    expect((await repo.listProblems())[0].archivedAt).toBeUndefined();
  });

  it('並び替えが順序に反映される', async () => {
    const { repo } = fresh();
    const a = await repo.addProblem('A');
    await repo.addProblem('B');
    await repo.moveProblem(a.id, 1);
    expect((await repo.listProblems()).map((p) => p.name)).toEqual(['B', 'A']);
  });

  it('症状別メモを保存できる', async () => {
    const { repo } = fresh();
    const p = await repo.addProblem('痛み');
    await repo.saveEntry({ ...base, localDate: '2026-05-01', problemNotes: { [p.id]: '朝がつらい' } });
    expect((await repo.getEntry('2026-05-01'))?.problemNotes[p.id]).toBe('朝がつらい');
  });

  it('再オープン後もデータが残る（永続化）', async () => {
    const db1 = new BuhiLogDB('persist');
    await createRepo(db1).saveEntry({ ...base, localDate: '2026-05-01', noteOther: '残る' });
    db1.close();
    const db2 = new BuhiLogDB('persist');
    expect((await createRepo(db2).getEntry('2026-05-01'))?.noteOther).toBe('残る');
  });

  it('設定の保存と全削除', async () => {
    const { repo } = fresh();
    expect((await repo.getSettings()).onboardingCompleted).toBe(false);
    await repo.saveSettings({ onboardingCompleted: true });
    expect((await repo.getSettings()).onboardingCompleted).toBe(true);
    await repo.addProblem('x');
    await repo.wipeAll();
    expect(await repo.listProblems(true)).toHaveLength(0);
    expect((await repo.getSettings()).onboardingCompleted).toBe(false);
  });
});

describe('アプローチの紐づけ変更', () => {
  it('登録後に対象の困りごとを追加・解除できる', async () => {
    const { repo } = fresh();
    const p = await repo.addProblem('痛み');
    const a = await repo.addApproach('ストレッチ', []);
    await repo.updateApproach(a.id, { linkedProblemIds: [p.id] });
    expect((await repo.listApproaches())[0].linkedProblemIds).toEqual([p.id]);
    await repo.updateApproach(a.id, { linkedProblemIds: [] });
    expect((await repo.listApproaches())[0].linkedProblemIds).toEqual([]);
  });
});
