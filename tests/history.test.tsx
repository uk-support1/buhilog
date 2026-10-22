import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { History } from '../src/features/History';
import { addDays, toLocalDate } from '../src/domain/date';

describe('履歴', () => {
  it('大分類ごとの入力数だけを1行で表示し、直近14日＋「さらに過去を見る」で続きを出す', async () => {
    const repo = createRepo(new BuhiLogDB('h1'));
    const p1 = await repo.addProblem('睡眠の質', undefined, '睡眠');
    const p2 = await repo.addProblem('頭痛', undefined, '困りごと', 'からだ');
    const p3 = await repo.addProblem('不安', undefined, '困りごと', 'こころ');
    const a1 = await repo.addApproach('朝ヨガ', [p2.id], undefined, '朝要因');
    await repo.saveSettings({ groupOrder: ['睡眠', '朝要因', '困りごと'] });
    const today = toLocalDate();
    await repo.saveEntry({
      localDate: today, problemRatings: { [p1.id]: 0, [p2.id]: 3 }, problemNotes: {}, approachStatuses: { [a1.id]: 'done' },
      bedtime: '23:00', wakeTime: '06:00', awakenings: [0, 0, 0, 0, 0, 0], note: 'メモ',
    });
    await repo.saveEntry({ localDate: addDays(today, -20), problemRatings: { [p3.id]: 6 }, problemNotes: {}, approachStatuses: {} });
    const user = userEvent.setup();
    render(<History repo={repo} onEdit={() => {}} />);
    expect(await screen.findByText('睡眠 4/4')).toBeInTheDocument();
    expect(screen.getByText('朝要因'.replace('要因', '') + ' 1/1')).toBeInTheDocument();
    expect(screen.getByText('困りごと 1/2')).toBeInTheDocument();
    expect(screen.getByText('メモあり')).toBeInTheDocument();
    // 項目名（細かい一覧）は出さない
    expect(screen.queryByText(/頭痛/)).toBeNull();
    // 14日分の行 + 「さらに過去を見る」
    expect(screen.getAllByRole('listitem')).toHaveLength(14);
    await user.click(screen.getByRole('button', { name: /さらに過去を見る/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(28);
    expect(screen.queryByRole('button', { name: /さらに過去を見る/ })).toBeNull(); // 最古(20日前)まで届いた
  });
});
