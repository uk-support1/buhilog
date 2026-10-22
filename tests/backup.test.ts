import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { backupDue, buildBackup, buildCsv, csvCell, parseBackup, restoreBackup } from '../src/db/backup';
import { buildSeries, compareApproach } from '../src/domain/analytics';
import { DEFAULT_SETTINGS } from '../src/domain/types';

let n = 0;
async function seeded() {
  const db = new BuhiLogDB(`b${n++}`);
  const repo = createRepo(db);
  const p = await repo.addProblem('痛み');
  const p2 = await repo.addProblem('不眠');
  const a = await repo.addApproach('ストレッチ', [p.id]);
  for (let i = 1; i <= 12; i++) {
    await repo.saveEntry({
      localDate: `2026-05-${String(i).padStart(2, '0')}`,
      problemRatings: { [p.id]: i % 3 === 0 ? null : i % 11, [p2.id]: 0 },
      problemNotes: { [p.id]: i === 1 ? '=HYPERLINK("x")\n改行,カンマ' : '' },
      approachStatuses: { [a.id]: i % 2 ? 'done' : 'not_done' },
      note: i === 2 ? '"引用"' : undefined,
    });
  }
  await repo.setProblemArchived(p2.id, true);
  return { db, repo, p, a };
}

describe('JSONバックアップ', () => {
  it('エクスポート→別DBへ復元で、記録と集計が一致する', async () => {
    const { repo, p, a } = await seeded();
    const text = JSON.stringify(await buildBackup(repo));
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const db2 = new BuhiLogDB(`b${n++}`);
    await restoreBackup(db2, r.backup);
    const repo2 = createRepo(db2);
    expect(await repo2.listEntries()).toEqual(await repo.listEntries());
    expect(await repo2.listProblems(true)).toEqual(await repo.listProblems(true));
    expect((await repo2.getSettings()).onboardingCompleted).toBe(true);
    const [e1, e2] = [await repo.listEntries(), await repo2.listEntries()];
    expect(compareApproach(e2, p.id, a.id, '2026-05-12', 28)).toEqual(compareApproach(e1, p.id, a.id, '2026-05-12', 28));
    expect(buildSeries(e2, p.id, '2026-05-12', 14)).toEqual(buildSeries(e1, p.id, '2026-05-12', 14));
  });

  it('不正なファイルは拒否し、DBに触れない', async () => {
    const { db, repo } = await seeded();
    const before = await repo.listEntries();
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('{}').ok).toBe(false);
    const good = await buildBackup(repo);
    const bad1 = { ...good, dailyEntries: [{ ...good.dailyEntries[0], problemRatings: { ghost: 3 } }] };
    expect(parseBackup(JSON.stringify(bad1)).ok).toBe(false);
    const bad2 = { ...good, dailyEntries: [good.dailyEntries[0], { ...good.dailyEntries[1], localDate: good.dailyEntries[0].localDate }] };
    expect(parseBackup(JSON.stringify(bad2)).ok).toBe(false);
    const bad3 = { ...good, dailyEntries: [{ ...good.dailyEntries[0], problemRatings: { [good.problems[0].id]: 99 } }] };
    expect(parseBackup(JSON.stringify(bad3)).ok).toBe(false);
    const bad4 = { ...good, approaches: [{ ...good.approaches[0], linkedProblemIds: ['ghost'] }] };
    expect(parseBackup(JSON.stringify(bad4)).ok).toBe(false);
    expect(await createRepo(db).listEntries()).toEqual(before);
  });

  it('復元が途中で失敗しても既存データは無傷（ロールバック）', async () => {
    const { db, repo } = await seeded();
    const before = await repo.listEntries();
    const good = await buildBackup(repo);
    const broken = { ...good, dailyEntries: [good.dailyEntries[0], good.dailyEntries[0]] }; // 主キー重複で bulkAdd 失敗
    await expect(restoreBackup(db, broken)).rejects.toThrow();
    expect(await repo.listEntries()).toEqual(before);
    expect((await repo.listProblems(true)).length).toBe(2);
  });
});

describe('CSV', () => {
  it('式インジェクションを無害化し、引用符・改行・カンマをエスケープ', () => {
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(csvCell('+x')).toBe(`"'+x"`);
    expect(csvCell('@a')).toBe(`"'@a"`);
    expect(csvCell('a"b,c\nd')).toBe(`"a""b,c\nd"`);
    expect(csvCell(0)).toBe('"0"');
  });
  it('未入力と0を区別して出力', async () => {
    const { repo } = await seeded();
    const csv = buildCsv(await buildBackup(repo));
    expect(csv.startsWith('﻿"日付"')).toBe(true);
    expect(csv).toContain('"未入力"');
    expect(csv).toContain('"痛み","1"');
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).toContain('"実施しなかった"');
  });
});

describe('バックアップ促し', () => {
  const day = 86_400_000;
  it('記録が無ければ促さない / 未実施・期限超過で促す', () => {
    expect(backupDue(false, DEFAULT_SETTINGS)).toBe(false);
    expect(backupDue(true, DEFAULT_SETTINGS)).toBe(true);
    expect(backupDue(true, { ...DEFAULT_SETTINGS, lastBackupAt: 100 * day }, 105 * day)).toBe(false);
    expect(backupDue(true, { ...DEFAULT_SETTINGS, lastBackupAt: 100 * day }, 114 * day)).toBe(true);
  });
});

describe('バックアップのお知らせ（追加の確認）', () => {
  const day = 86_400_000;
  it('「あとで」の期間中は出さず、過ぎれば再び出す', () => {
    const s = { ...DEFAULT_SETTINGS, backupSnoozedUntil: 110 * day };
    expect(backupDue(true, s, 105 * day)).toBe(false);
    expect(backupDue(true, s, 111 * day)).toBe(true);
  });
  it('復元しても「最後のバックアップ日」を失わず、ファイルの作成日時を引き継ぐ', async () => {
    const { repo } = await seeded();
    const b = await buildBackup(repo);
    const stamp = '2026-10-22T10:00:00Z';
    const r = parseBackup(JSON.stringify({ ...b, exportedAt: stamp, settings: { ...b.settings, lastBackupAt: undefined } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const db2 = new BuhiLogDB(`b${n++}`);
    await restoreBackup(db2, r.backup);
    expect((await createRepo(db2).getSettings()).lastBackupAt).toBe(Date.parse(stamp));
    // 復元直後は「期限切れ」ではない
    expect(backupDue(true, await createRepo(db2).getSettings(), Date.parse(stamp) + day)).toBe(false);
  });
});
