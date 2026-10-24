import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { Today } from '../src/features/Today';

describe('運動要因: 未回答をまとめて「実施しなかった」に', () => {
  async function setup(name: string) {
    const repo = createRepo(new BuhiLogDB(name));
    const p = await repo.addProblem('頭痛', undefined, '困りごと');
    const a1 = await repo.addApproach('腕立', [p.id], undefined, '運動要因');
    const a2 = await repo.addApproach('腹筋', [p.id], undefined, '運動要因');
    const a3 = await repo.addApproach('カール', [p.id], undefined, '運動要因');
    const m = await repo.addApproach('マルチタスクをやらない', [p.id], undefined, '日中要因');
    return { repo, a1, a2, a3, m };
  }

  it('未回答だけが「実施しなかった」になり、「実施した」にしたものは変わらない。件数も表示される', async () => {
    const { repo, a1, a2, a3 } = await setup('bk1');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-07-01" />);
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('tab', { name: /運動要因/ }));
    const bulk = screen.getByRole('button', { name: /未回答をまとめて「実施しなかった」にする（3件）/ });
    await user.click(screen.getAllByRole('radio', { name: '実施した' })[0]); // 腕立 = 実施した
    expect(screen.getByRole('button', { name: /（2件）/ })).toBeInTheDocument();
    await user.click(bulk); // 同じボタン（表示の件数だけが変わる）
    expect(screen.getByRole('button', { name: /（0件）/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    const e = await repo.getEntry('2026-07-01');
    expect(e?.approachStatuses).toEqual({ [a1.id]: 'done', [a2.id]: 'not_done', [a3.id]: 'not_done' });
  });

  it('前夜要因・日中要因など、「しなかった」が逆の意味になりうるグループには、まとめボタンを出さない', async () => {
    const { repo } = await setup('bk2');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-07-02" />);
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('tab', { name: /日中要因/ }));
    expect(screen.queryByRole('button', { name: /まとめて/ })).toBeNull();
  });
});
