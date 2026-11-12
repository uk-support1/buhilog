import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { Manage } from '../src/features/Manage';
import { Today } from '../src/features/Today';

async function setup(name: string) {
  const repo = createRepo(new BuhiLogDB(name));
  const a = await repo.addProblem('Aさん', undefined, '困りごと', '人との関係');
  const b = await repo.addProblem('Bさん', undefined, '困りごと', '人との関係');
  return { repo, a, b };
}

describe('困りごとのすぐ下に出す〇／×の項目', () => {
  it('管理画面で追加でき、その困りごとの対策として結びつく', async () => {
    const user = userEvent.setup();
    const { repo, a } = await setup('under1');
    render(<Manage repo={repo} />);
    await screen.findAllByRole('option', { name: /Aさんの下/ });
    await user.type(screen.getByLabelText('新しいアプローチ'), '心配→先にやる');
    await user.selectOptions(screen.getByLabelText('この困りごとの下に出す'), a.id);
    await user.type(screen.getByLabelText('実施した側のボタン名'), '〇');
    await user.type(screen.getByLabelText('しなかった側のボタン名'), '×');
    await user.type(screen.getByLabelText('メモ欄の名前'), '何をやったか');
    const form = screen.getByLabelText('新しいアプローチ').closest('form')!;
    await user.click(within(form).getAllByRole('button', { name: '追加' })[0]);
    await waitFor(async () => {
      const x = (await repo.listApproaches()).find((p) => p.name === '心配→先にやる');
      expect(x).toMatchObject({ underProblemId: a.id, group: '困りごと', section: '人との関係', linkedProblemIds: [a.id], doneLabel: '〇', notDoneLabel: '×', noteLabel: '何をやったか' });
    });
  });

  it('今日の画面では、その困りごとのすぐ下に出る。〇だけメモ欄が出て、もう一度押すと未回答に戻る。一覧には重ねて出ない', async () => {
    const user = userEvent.setup();
    const { repo, a } = await setup('under2');
    const x = await repo.addApproach('心配→先にやる', [], undefined, undefined, undefined, { underProblemId: a.id, doneLabel: '〇', notDoneLabel: '×', noteLabel: '何をやったか' });
    render(<Today repo={repo} initialDate="2026-11-14" />);
    await user.click(await screen.findByRole('tab', { name: /困りごと/ }));
    const item = (await screen.findAllByLabelText('Aさん')).find((el) => el.classList.contains('item'))!;
    const g = within(item).getByRole('radiogroup', { name: '心配→先にやる' });
    // Aさんのブロックの中にあり、Bさんのブロックにはない
    expect(within(screen.getAllByLabelText('Bさん').find((el) => el.classList.contains('item'))!).queryByRole('radiogroup', { name: '心配→先にやる' })).toBeNull();
    expect(screen.getAllByRole('radiogroup', { name: '心配→先にやる' })).toHaveLength(1);
    expect(within(g).queryByRole('radio', { name: '未回答' })).toBeNull();
    expect(screen.queryByLabelText('心配→先にやるのメモ')).toBeNull();
    await user.click(within(g).getByRole('radio', { name: '×' }));
    expect(screen.queryByLabelText('心配→先にやるのメモ')).toBeNull();
    await user.click(within(g).getByRole('radio', { name: '〇' }));
    await user.type(screen.getByLabelText('心配→先にやるのメモ'), '体調を聞いてから、洗い物をやっておいた');
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(async () => {
      const e = await repo.getEntry('2026-11-14');
      expect(e?.approachStatuses[x.id]).toBe('done');
      expect(e?.approachNotes).toEqual({ [x.id]: '体調を聞いてから、洗い物をやっておいた' });
    });
    await user.click(within(g).getByRole('radio', { name: '〇' })); // もう一度 → 未回答
    expect(within(g).getByRole('radio', { name: '〇' })).toHaveAttribute('aria-checked', 'false');
    expect(within(g).getByRole('radio', { name: '×' })).toHaveAttribute('aria-checked', 'false');
  });
});
