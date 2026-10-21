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
