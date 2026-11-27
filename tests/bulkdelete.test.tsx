import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { Calendar } from '../src/features/Calendar';

async function setup(name: string) {
  const repo = createRepo(new BuhiLogDB(name));
  const ev = (title: string, date: string, extra = {}) => repo.saveEvent({ title, date, allDay: true, ...extra });
  await ev('🚗仕事', '2026-12-01', { source: 'ics', uid: 'a' });
  await ev('🚗仕事', '2026-12-03', { source: 'ics', uid: 'b' });
  await ev('🚗仕事', '2027-01-05', { source: 'ics', uid: 'c' });
  await ev('整体', '2026-12-18', { source: 'ics', uid: 'd' });
  await ev('歯医者', '2026-12-20'); // 手で入れた予定
  return repo;
}
const open = async (user: ReturnType<typeof userEvent.setup>) => {
  const sec = await screen.findByRole('region', { name: '予定をまとめて削除' });
  await user.click(within(sec).getByText('予定をまとめて削除'));
  return sec;
};

describe('予定のまとめて削除', () => {
  it('名前で絞って、表示中をすべて選び、まとめて削除できる。ほかの予定は残る', async () => {
    const user = userEvent.setup();
    const repo = await setup('bulk1');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Calendar repo={repo} initialDate="2026-12-01" />);
    const sec = await open(user);
    await user.type(within(sec).getByLabelText('名前で絞る'), '仕事');
    expect(within(sec).getAllByRole('checkbox').filter((c) => /仕事/.test(c.getAttribute('aria-label') ?? ''))).toHaveLength(3);
    await user.click(within(sec).getByRole('button', { name: '表示中の3件をすべて選ぶ' }));
    await user.click(within(sec).getByRole('button', { name: '選んだ3件を削除' }));
    await waitFor(async () => expect((await repo.listEvents()).map((e) => e.title).sort()).toEqual(['整体', '歯医者']));
  });

  it('絞り込みで見えなくなった選びは、消さない', async () => {
    const user = userEvent.setup();
    const repo = await setup('bulk2');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Calendar repo={repo} initialDate="2026-12-01" />);
    const sec = await open(user);
    await user.click(within(sec).getByRole('checkbox', { name: /整体/ })); // 整体を選ぶ
    await user.type(within(sec).getByLabelText('名前で絞る'), '歯医者'); // 整体は見えなくなる
    expect(within(sec).getByRole('button', { name: '選んだ0件を削除' })).toBeDisabled();
    expect((await repo.listEvents())).toHaveLength(5);
  });

  it('「読み込んだ予定だけ」と日付の範囲で絞れる', async () => {
    const user = userEvent.setup();
    const repo = await setup('bulk3');
    render(<Calendar repo={repo} initialDate="2026-12-01" />);
    const sec = await open(user);
    expect(within(sec).queryByRole('checkbox', { name: /歯医者/ })).toBeInTheDocument();
    await user.click(within(sec).getByRole('checkbox', { name: /読み込んだ予定だけ/ }));
    expect(within(sec).queryByRole('checkbox', { name: /歯医者/ })).toBeNull(); // 手で入れた予定は出ない
    const to = within(sec).getByLabelText('この日まで');
    await user.type(to, '2026-12-31');
    expect(within(sec).queryByRole('checkbox', { name: /仕事 1月5日/ })).toBeNull(); // 範囲の外
    expect(within(sec).getAllByRole('checkbox').filter((c) => /仕事/.test(c.getAttribute('aria-label') ?? ''))).toHaveLength(2);
  });

  it('消した直後は「元に戻す」で、そのまま戻る。確認で「いいえ」なら消えない', async () => {
    const user = userEvent.setup();
    const repo = await setup('bulk4');
    const conf = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Calendar repo={repo} initialDate="2026-12-01" />);
    const sec = await open(user);
    await user.click(within(sec).getByRole('checkbox', { name: /整体/ }));
    await user.click(within(sec).getByRole('button', { name: '選んだ1件を削除' }));
    expect(await repo.listEvents()).toHaveLength(5);
    conf.mockReturnValue(true);
    await user.click(within(sec).getByRole('button', { name: '選んだ1件を削除' }));
    await waitFor(async () => expect(await repo.listEvents()).toHaveLength(4));
    await user.click(await screen.findByRole('button', { name: '元に戻す' }));
    await waitFor(async () => expect(await repo.listEvents()).toHaveLength(5));
    expect((await repo.listEvents()).find((e) => e.title === '整体')).toMatchObject({ uid: 'd', date: '2026-12-18' });
  });
});
