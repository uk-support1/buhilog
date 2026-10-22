import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { Today } from '../src/features/Today';

describe('Today 画面', () => {
  it('評価0と未入力を区別して保存し、再表示できる', async () => {
    const repo = createRepo(new BuhiLogDB('ui1'));
    const p1 = await repo.addProblem('痛み');
    const p2 = await repo.addProblem('不眠');
    const a = await repo.addApproach('ストレッチ', [p1.id]);
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-05-01" />);
    await screen.findByText('痛み');
    const pain = screen.getByRole('radiogroup', { name: '痛みの強さ' });
    await user.click(pain.querySelector('button')!); // 0
    await user.click(screen.getByRole('radio', { name: '実施しなかった' }));
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    const e = await repo.getEntry('2026-05-01');
    expect(e?.problemRatings[p1.id]).toBe(0);
    expect(e?.problemRatings[p2.id]).toBeUndefined();
    expect(e?.approachStatuses[a.id]).toBe('not_done');
    await waitFor(() => expect(screen.getByText(/記録あり/)).toBeInTheDocument());
  });
});

describe('かんたん記録', () => {
  it('初期はメモ・睡眠を隠し、ボタンで開閉できる。入力済みの日は最初から開く', async () => {
    const repo = createRepo(new BuhiLogDB('ui2'));
    const p = await repo.addProblem('痛み');
    const user = userEvent.setup();
    const { unmount } = render(<Today repo={repo} initialDate="2026-05-02" />);
    await screen.findByText('痛み');
    expect(screen.queryByLabelText(/睡眠時間/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /くわしく入力する/ }));
    expect(screen.getByLabelText(/睡眠時間/)).toBeInTheDocument();
    unmount();

    await repo.saveEntry({ localDate: '2026-05-03', problemRatings: { [p.id]: 2 }, problemNotes: { [p.id]: '朝つらい' }, approachStatuses: {} });
    render(<Today repo={repo} initialDate="2026-05-03" />);
    expect(await screen.findByDisplayValue('朝つらい')).toBeInTheDocument();
  });

  it('かんたんのまま保存しても、隠れた項目（既存メモ）を消さない', async () => {
    const repo = createRepo(new BuhiLogDB('ui3'));
    const p = await repo.addProblem('痛み');
    await repo.saveEntry({ localDate: '2026-05-04', problemRatings: { [p.id]: 2 }, problemNotes: { [p.id]: '残す' }, approachStatuses: {}, sleepHours: 6 });
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-05-04" />);
    await screen.findByDisplayValue('残す');
    await user.click(screen.getByRole('button', { name: /くわしいリ?入力をたたむ|たたむ/ }));
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    const e = await repo.getEntry('2026-05-04');
    expect(e?.problemNotes[p.id]).toBe('残す');
    expect(e?.sleepHours).toBe(6);
  });
});

describe('グループ（タブ）表示', () => {
  it('タブで切り替えられ、メモ入力中にフォーカスが外れない', async () => {
    const repo = createRepo(new BuhiLogDB('ui4'));
    const p1 = await repo.addProblem('頭痛', undefined, '困りごと', 'からだ');
    await repo.addProblem('睡眠の質', undefined, '睡眠');
    await repo.addApproach('朝ヨガ', [p1.id], undefined, '朝要因');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-05-05" />);
    await screen.findByRole('tablist');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['困りごと0/1', '睡眠0/1', '朝要因0/1', '睡眠・メモ']);
    expect(screen.getByText('頭痛')).toBeInTheDocument();
    expect(screen.queryByText('朝ヨガ')).toBeNull();
    await user.click(screen.getByRole('tab', { name: /朝要因/ }));
    await user.click(screen.getByRole('radio', { name: '実施した' }));
    expect(screen.getByRole('tab', { name: /朝要因1\/1/ })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /困りごと/ }));
    await user.click(screen.getByText('メモ'));
    const memo = screen.getByLabelText('頭痛のメモ');
    await user.type(memo, 'abc');
    expect(memo).toHaveFocus();
    expect(memo).toHaveValue('abc');
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    const e = await repo.getEntry('2026-05-05');
    expect(e?.problemNotes[p1.id]).toBe('abc');
  });
});
