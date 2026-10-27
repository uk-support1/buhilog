import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { buildBackup, parseBackup, restoreBackup } from '../src/db/backup';
import { Calendar } from '../src/features/Calendar';
import { Today } from '../src/features/Today';
import { toLocalDate } from '../src/domain/date';

const base = { allDay: false as const, title: '通院', date: '2026-11-10' };

describe('予定のデータ', () => {
  it('追加・更新・削除ができ、不正な入力は保存されない', async () => {
    const repo = createRepo(new BuhiLogDB('ev1'));
    const e = await repo.saveEvent({ ...base, startTime: '10:00', endTime: '11:00', place: '病院' });
    expect((await repo.listEvents())[0]).toMatchObject({ title: '通院', startTime: '10:00', place: '病院' });
    await repo.saveEvent({ ...e, title: '通院（変更）' });
    const list = await repo.listEvents();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: e.id, title: '通院（変更）', createdAt: e.createdAt });
    await expect(repo.saveEvent({ ...base, title: '   ' })).rejects.toThrow();
    await expect(repo.saveEvent({ ...base, endDate: '2026-11-09' })).rejects.toThrow(); // 終了日が開始日より前
    await expect(repo.saveEvent({ ...base, startTime: '11:00', endTime: '10:00' })).rejects.toThrow(); // 終了が開始より前
    await expect(repo.saveEvent({ ...base, startTime: '25:00' })).rejects.toThrow();
    await repo.deleteEvent(e.id);
    expect(await repo.listEvents()).toHaveLength(0);
  });

  it('バックアップの往復で予定が保たれる。全消去で予定も消える', async () => {
    const repo = createRepo(new BuhiLogDB('ev2'));
    await repo.saveEvent({ ...base, repeat: { freq: 'weekly', interval: 1, weekdays: [2] }, exdates: ['2026-11-17'], memo: 'メモ' });
    const b = await buildBackup(repo);
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const db2 = new BuhiLogDB('ev2b');
    await restoreBackup(db2, r.backup);
    expect((await createRepo(db2).listEvents())[0]).toMatchObject({ title: '通院', repeat: { freq: 'weekly', weekdays: [2] }, exdates: ['2026-11-17'] });
    // 予定の入っていない旧いバックアップも読み込める
    const { events: _e, ...old } = b;
    expect(parseBackup(JSON.stringify(old)).ok).toBe(true);
    await repo.wipeAll();
    expect(await repo.listEvents()).toHaveLength(0);
  });
});

describe('カレンダー画面', () => {
  it('日を選んで予定を追加すると、その日の一覧と月の表示に出る。編集・削除もできる', async () => {
    const repo = createRepo(new BuhiLogDB('cal1'));
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Calendar repo={repo} initialDate="2026-11-10" />);
    expect(await screen.findByText('2026年11月')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /この日に予定を追加/ }));
    await user.type(screen.getByLabelText('予定の名前'), '通院');
    await user.type(screen.getByLabelText('場所'), '病院');
    await user.selectOptions(screen.getByLabelText('開始時刻'), '10:00');
    await user.click(screen.getByRole('button', { name: '保存する' }));
    const list = await screen.findByRole('region', { name: '11月10日（火）の予定' });
    expect(within(list).getByText('通院')).toBeInTheDocument();
    expect(within(list).getByText('10:00〜')).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /11月10日（火） 予定1件/ })).toBeInTheDocument();
    // 編集
    await user.click(within(list).getByRole('button', { name: '編集' }));
    await user.clear(screen.getByLabelText('予定の名前'));
    await user.type(screen.getByLabelText('予定の名前'), '歯科');
    await user.click(screen.getByRole('button', { name: '保存する' }));
    expect(await within(await screen.findByRole('region', { name: '11月10日（火）の予定' })).findByText('歯科')).toBeInTheDocument();
    // 削除
    await user.click(screen.getByRole('button', { name: '編集' }));
    await user.click(screen.getByRole('button', { name: '削除' }));
    expect(await screen.findByText('予定はありません。')).toBeInTheDocument();
    expect(await repo.listEvents()).toHaveLength(0);
  });

  it('毎週の予定は、月の各週に出る。「この日だけ削除」で、その日だけ消える', async () => {
    const repo = createRepo(new BuhiLogDB('cal2'));
    await repo.saveEvent({ ...base, title: 'デイケア', date: '2026-11-03', repeat: { freq: 'weekly', interval: 1 } }); // 毎週火曜
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Calendar repo={repo} initialDate="2026-11-10" />);
    for (const d of ['3日（火）', '10日（火）', '17日（火）', '24日（火）']) {
      expect(await screen.findByRole('gridcell', { name: new RegExp(`11月${d} 予定1件`) })).toBeInTheDocument();
    }
    expect(screen.queryByRole('gridcell', { name: /11月11日（水） 予定/ })).toBeNull();
    await user.click(await screen.findByRole('button', { name: '編集' })); // 11/10 の予定
    await user.click(screen.getByRole('button', { name: 'この日だけ削除' }));
    expect(await screen.findByText('予定はありません。')).toBeInTheDocument();
    expect(screen.queryByRole('gridcell', { name: /11月10日（火） 予定/ })).toBeNull();
    expect(screen.getByRole('gridcell', { name: /11月17日（火） 予定1件/ })).toBeInTheDocument(); // ほかの週は残る
    expect((await repo.listEvents())[0].exdates).toEqual(['2026-11-10']);
  });

  it('記録のある日に印が付く。前の月・次の月に移動できる', async () => {
    const repo = createRepo(new BuhiLogDB('cal3'));
    await repo.saveEntry({ localDate: '2026-11-05', problemRatings: {}, problemNotes: {}, approachStatuses: {} });
    const user = userEvent.setup();
    render(<Calendar repo={repo} initialDate="2026-11-10" />);
    expect(await screen.findByRole('gridcell', { name: /11月5日（木） 記録あり/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '次の月' }));
    expect(screen.getByText('2026年12月')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '前の月' }));
    await user.click(screen.getByRole('button', { name: '前の月' }));
    expect(screen.getByText('2026年10月')).toBeInTheDocument();
  });
});

describe('今日の画面の一番上の予定', () => {
  it('その日の予定が出る。日付を変えると、その日の予定に変わる。予定がなければ案内を出す', async () => {
    const repo = createRepo(new BuhiLogDB('ev3'));
    const today = toLocalDate();
    await repo.saveEvent({ ...base, date: today, title: '友人とランチ', startTime: '12:00', endTime: '13:30', place: '駅前' });
    await repo.saveEvent({ ...base, date: '2026-01-05', title: '別の日の予定', allDay: true });
    const open = vi.fn();
    render(<Today repo={repo} onOpenCalendar={open} />);
    const card = await screen.findByRole('region', { name: '今日の予定' });
    expect(within(card).getByText('友人とランチ')).toBeInTheDocument();
    expect(within(card).getByText('12:00〜13:30')).toBeInTheDocument();
    expect(within(card).queryByText('別の日の予定')).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'カレンダーを開く' }));
    expect(open).toHaveBeenCalledWith(today);
  });

  it('予定のない日は「予定はありません」と、追加の入口を出す', async () => {
    const repo = createRepo(new BuhiLogDB('ev4'));
    const open = vi.fn();
    render(<Today repo={repo} initialDate="2026-03-03" onOpenCalendar={open} />);
    const card = await screen.findByRole('region', { name: '3月3日（火）の予定' });
    expect(within(card).getByText('予定はありません。')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: '予定を追加' }));
    expect(open).toHaveBeenCalledWith('2026-03-03');
  });
});

describe('予定の読み込み（重複しない）', () => {
  it('同じuidは、2回読み込んでも1件のまま更新される', async () => {
    const repo = createRepo(new BuhiLogDB('ev-import'));
    const item = { uid: 'u1', source: 'ics' as const, allDay: true, title: '仕事', date: '2026-11-02' };
    expect(await repo.importEvents([item, { ...item, uid: 'u2', date: '2026-11-03' }])).toEqual({ added: 2, updated: 0 });
    expect(await repo.importEvents([{ ...item, title: '🚗仕事' }])).toEqual({ added: 0, updated: 1 });
    const list = await repo.listEvents();
    expect(list).toHaveLength(2);
    expect(list.find((e) => e.uid === 'u1')?.title).toBe('🚗仕事');
  });
});
