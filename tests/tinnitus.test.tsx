import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dexie from 'dexie';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { parseBackup } from '../src/db/backup';
import { ensureMorningTinnitus } from '../src/domain/tinnitus';
import { Today } from '../src/features/Today';
import type { Problem } from '../src/domain/types';

const pr = (id: string, name: string, order: number, extra: Partial<Problem> = {}): Problem => ({ id, name, order, createdAt: 0, updatedAt: 0, ...extra });

describe('朝の耳鳴り', () => {
  const base = [pr('q', '睡眠の質', 0, { group: '睡眠', section: 'よく眠れたか' }), pr('h', '頭痛', 1, { group: '困りごと' }), pr('s', '肩', 2, { group: '困りごと' })];
  it('睡眠の質のすぐ下に、同じグループで足す。後ろの項目の順番は1つずつ後ろへ。何度実行しても1つだけ', () => {
    const r = ensureMorningTinnitus(base, () => 't', 9);
    const sorted = [...r.problems].sort((a, b) => a.order - b.order).map((p) => p.name);
    expect(sorted).toEqual(['睡眠の質', '朝の耳鳴り', '頭痛', '肩']);
    const t = r.problems.find((p) => p.name === '朝の耳鳴り')!;
    expect(t).toMatchObject({ group: '睡眠', section: 'よく眠れたか', description: '5＝ない 〜 4＝少しある 〜 1＝強い' });
    expect(new Set(r.problems.map((p) => p.order)).size).toBe(4); // 順番が重ならない
    expect(ensureMorningTinnitus(r.problems, () => 'u', 10).changed).toBe(false);
  });
  it('睡眠の質がなければ、睡眠グループで最後に足す', () => {
    const r = ensureMorningTinnitus([pr('h', '頭痛', 0, { group: '困りごと' })], () => 't', 1);
    expect(r.problems.find((p) => p.name === '朝の耳鳴り')).toMatchObject({ group: '睡眠', order: 1 });
  });
  it('旧いDBを開くと足され、ほかの項目の中身は変わらない', async () => {
    const legacy = new Dexie('legacy-v13');
    const stores = { problems: 'id, order, archivedAt', approaches: 'id, archivedAt', dailyEntries: 'id, &localDate', settings: 'key', medications: 'id, order, archivedAt', events: 'id, date', todos: 'id, list, order' };
    for (let v = 1; v <= 13; v++) legacy.version(v).stores(stores);
    await legacy.table('problems').bulkAdd(base);
    await legacy.table('settings').add({ key: 'app', schemaVersion: 13, onboardingCompleted: true, backupReminderDays: 14 });
    legacy.close();
    const repo = createRepo(new BuhiLogDB('legacy-v13'));
    const ps = await repo.listProblems();
    expect(ps.map((p) => p.name)).toEqual(['睡眠の質', '朝の耳鳴り', '頭痛', '肩']);
    expect(ps.find((p) => p.id === 'h')).toMatchObject({ name: '頭痛', group: '困りごと' });
  });
  it('旧い形式のバックアップを復元しても足される', () => {
    const old = { formatVersion: 2, exportedAt: '2026-11-01T00:00:00Z', problems: base, approaches: [], dailyEntries: [], settings: { schemaVersion: 13, onboardingCompleted: true, backupReminderDays: 14 } };
    const r = parseBackup(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.backup.problems.map((p) => p.name)).toContain('朝の耳鳴り');
  });
  it('今日の画面の睡眠タブでは、睡眠の質の下に5段階で出て、保存できる', async () => {
    const user = userEvent.setup();
    const repo = createRepo(new BuhiLogDB('tinnitus-ui'));
    await repo.addProblem('睡眠の質', undefined, '睡眠');
    await repo.addProblem('朝の耳鳴り', '5＝ない 〜 4＝少しある 〜 1＝強い', '睡眠');
    render(<Today repo={repo} initialDate="2026-11-27" />);
    const names = (await screen.findAllByLabelText(/^(睡眠の質|朝の耳鳴り)$/)).filter((el) => el.classList.contains('item')).map((el) => el.getAttribute('aria-label'));
    expect(names).toEqual(['睡眠の質', '朝の耳鳴り']);
    expect(screen.getByText('5＝ない 〜 4＝少しある 〜 1＝強い')).toBeInTheDocument();
    await user.click(within(screen.getByRole('radiogroup', { name: '朝の耳鳴りの調子' })).getByRole('radio', { name: '4' }));
    await user.click(screen.getByRole('button', { name: /保存/ }));
    const pid = (await repo.listProblems()).find((p) => p.name === '朝の耳鳴り')!.id;
    await screen.findByText(/保存しました/);
    expect((await repo.getEntry('2026-11-27'))?.problemRatings[pid]).toBe(4);
  });
});
