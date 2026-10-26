import Dexie from 'dexie';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { buildBackup, parseBackup } from '../src/db/backup';
import { convertLegacyRatings, legacyRatingToNew } from '../src/domain/scale';

describe('困りごとの点数スケール（旧0〜10 → 新1〜5、5が良い）', () => {
  it('表の記号に対応する値: ◎0→5, ○3→4, △6→2, ✕9→1。全範囲が1〜5に収まり、向きが逆転して単調', () => {
    expect([0, 3, 6, 9].map(legacyRatingToNew)).toEqual([5, 4, 2, 1]);
    const all = Array.from({ length: 11 }, (_, i) => legacyRatingToNew(i));
    expect(all).toEqual([5, 5, 4, 4, 4, 3, 2, 2, 2, 1, 1]);
    for (let i = 1; i < all.length; i++) expect(all[i]).toBeLessThanOrEqual(all[i - 1]); // つらいほど小さい
    expect(convertLegacyRatings({ a: 0, b: null, c: 9 })).toEqual({ a: 5, b: null, c: 1 });
  });

  it('DBを旧版(v1)から開くと、保存済みの記録が一度だけ変換される（未入力はそのまま）', async () => {
    const legacy = new Dexie('legacy-scale');
    legacy.version(1).stores({ problems: 'id, order, archivedAt', approaches: 'id, archivedAt', dailyEntries: 'id, &localDate', settings: 'key' });
    await legacy.table('problems').add({ id: 'p1', name: '睡眠の質', description: '深さ（0＝よく眠れた）', order: 0, createdAt: 0, updatedAt: 0 });
    await legacy.table('dailyEntries').bulkAdd([
      { id: 'e1', localDate: '2026-05-01', problemRatings: { p1: 0 }, problemNotes: {}, approachStatuses: {}, createdAt: 0, updatedAt: 0 },
      { id: 'e2', localDate: '2026-05-02', problemRatings: { p1: 3 }, problemNotes: {}, approachStatuses: {}, createdAt: 0, updatedAt: 0 },
      { id: 'e3', localDate: '2026-05-03', problemRatings: { p1: 6 }, problemNotes: {}, approachStatuses: {}, createdAt: 0, updatedAt: 0 },
      { id: 'e4', localDate: '2026-05-04', problemRatings: { p1: 9 }, problemNotes: {}, approachStatuses: {}, createdAt: 0, updatedAt: 0 },
      { id: 'e5', localDate: '2026-05-05', problemRatings: { p1: null }, problemNotes: {}, approachStatuses: {}, createdAt: 0, updatedAt: 0 },
    ]);
    await legacy.table('settings').add({ key: 'app', schemaVersion: 1, onboardingCompleted: true, backupReminderDays: 14 });
    legacy.close();

    const db = new BuhiLogDB('legacy-scale'); // v2 を開く → upgrade が走る
    const repo = createRepo(db);
    expect((await repo.listEntries()).map((e) => e.problemRatings.p1)).toEqual([5, 4, 2, 1, null]);
    expect((await repo.listProblems())[0].description).toBe('深さ（5＝よく眠れた）');
    expect((await repo.getSettings()).schemaVersion).toBe(6); // v1 → v6 まで順に移行される
    db.close();
    // 再度開いても二重に変換されない
    const again = new BuhiLogDB('legacy-scale');
    expect((await createRepo(again).listEntries()).map((e) => e.problemRatings.p1)).toEqual([5, 4, 2, 1, null]);
  });

  it('旧形式(formatVersion 1)のバックアップは1〜5に変換して復元でき、新形式で書き出す', async () => {
    const v1 = {
      formatVersion: 1, exportedAt: '2026-10-22T10:00:00Z',
      problems: [{ id: 'p1', name: '頭痛', order: 0, createdAt: 0, updatedAt: 0 }],
      approaches: [],
      dailyEntries: [{ id: 'e1', localDate: '2026-05-01', problemRatings: { p1: 6 }, problemNotes: {}, approachStatuses: {}, createdAt: 0, updatedAt: 0 }],
      settings: { schemaVersion: 1, onboardingCompleted: true, backupReminderDays: 14 },
    };
    const r = parseBackup(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.dailyEntries[0].problemRatings.p1).toBe(2);
    expect(r.backup.formatVersion).toBe(2);
    expect(r.backup.settings.schemaVersion).toBe(6);
    // 新形式は変換されない（二重変換の防止）
    const db = new BuhiLogDB('scale-new');
    const repo = createRepo(db);
    await repo.addProblem('頭痛');
    const p = (await repo.listProblems())[0];
    await repo.saveEntry({ localDate: '2026-05-02', problemRatings: { [p.id]: 4 }, problemNotes: {}, approachStatuses: {} });
    const out = await buildBackup(repo);
    expect(out.formatVersion).toBe(2);
    const re = parseBackup(JSON.stringify(out));
    expect(re.ok && re.backup.dailyEntries[0].problemRatings[p.id]).toBe(4);
    // 範囲外(旧スケール値のまま)の新形式は拒否
    const bad = { ...out, dailyEntries: [{ ...out.dailyEntries[0], problemRatings: { [p.id]: 8 } }] };
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
  });
});
