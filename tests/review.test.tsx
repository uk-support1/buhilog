import { render, screen } from '@testing-library/react';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { Review } from '../src/features/Review';
import { addDays, toLocalDate } from '../src/domain/date';
import { describeComparison } from '../src/domain/text';
import { compareApproach } from '../src/domain/analytics';
import type { DailyEntry } from '../src/domain/types';

describe('Review 画面', () => {
  it('記録0件でも壊れず案内を表示', async () => {
    const repo = createRepo(new BuhiLogDB('rv0'));
    await repo.addProblem('痛み');
    render(<Review repo={repo} />);
    expect(await screen.findByText(/評価の記録がありません/)).toBeInTheDocument();
  });
  it('データ不足では差を出さず、必要日数を案内する', async () => {
    const repo = createRepo(new BuhiLogDB('rv1'));
    const p = await repo.addProblem('痛み');
    const a = await repo.addApproach('ストレッチ', [p.id]);
    const t = toLocalDate();
    await repo.saveEntry({ localDate: t, problemRatings: { [p.id]: 3 }, problemNotes: {}, approachStatuses: { [a.id]: 'done' } });
    await repo.saveEntry({ localDate: addDays(t, -1), problemRatings: { [p.id]: 6 }, problemNotes: {}, approachStatuses: { [a.id]: 'not_done' } });
    render(<Review repo={repo} />);
    expect(await screen.findByText(/参考値としてのみ表示/)).toBeInTheDocument();
    expect(screen.getByText(/あと: 「実施した日」あと4日/)).toBeInTheDocument();
    expect(screen.queryByText(/差（実施した日/)).toBeNull();
  });
});

describe('文言', () => {
  it('禁止語（効果・原因の断定・確率）を含まない', () => {
    const e = (id: string, localDate: string, r: number, st: 'done' | 'not_done'): DailyEntry => ({
      id, localDate, problemRatings: { p: r }, problemNotes: {}, approachStatuses: { a: st }, createdAt: 0, updatedAt: 0,
    });
    const mk = (nd: number, nn: number) => {
      const es: DailyEntry[] = [
        ...[...Array(nd)].map((_, i) => e('d' + i, addDays('2026-05-28', -i), 2, 'done')),
        ...[...Array(nn)].map((_, i) => e('n' + i, addDays('2026-05-28', -20 - i), 5, 'not_done')),
      ];
      return describeComparison(compareApproach(es, 'p', 'a', '2026-05-28', 56), 'ストレッチ');
    };
    for (const t of [mk(0, 0), mk(2, 2), mk(6, 6)]) {
      const all = [t.headline, ...t.lines, ...t.caution].join('');
      expect(all).not.toMatch(/効いた|改善確率|成功率|治る|有効/);
    }
    expect(mk(6, 6).lines.join('')).toMatch(/-3\.0ポイント/);
  });
});
