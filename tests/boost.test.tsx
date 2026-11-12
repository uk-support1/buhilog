import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { buildBackup, buildCsv } from '../src/db/backup';
import { boostActionsOf, boostSummary, toggleBoost, BOOST_NONE, DEFAULT_BOOST_ACTIONS } from '../src/domain/boost';
import { Today } from '../src/features/Today';
import { Manage } from '../src/features/Manage';
import type { DailyEntry } from '../src/domain/types';

const en = (d: string, e: Partial<DailyEntry>): DailyEntry => ({ id: `e${d}`, localDate: d, problemRatings: {}, problemNotes: {}, approachStatuses: {}, createdAt: 0, updatedAt: 0, ...e });

describe('上げる方法（domain）', () => {
  it('初期の一覧は4つで、「何もしなかった」が最後。保存した一覧でも最後に1つだけ', () => {
    expect(boostActionsOf().map((a) => a.name)).toEqual(['シャワーを浴びる', "B'zの動画をみる", '大学の時の動画をみる', '何もしなかった']);
    const custom = boostActionsOf([{ id: 'x', name: '散歩' }]);
    expect(custom.map((a) => a.id)).toEqual(['x', BOOST_NONE]);
  });
  it('「何もしなかった」とほかは同時に選べない', () => {
    expect(toggleBoost(['shower'], 'bz')).toEqual(['shower', 'bz']);
    expect(toggleBoost(['shower', 'bz'], BOOST_NONE)).toEqual([BOOST_NONE]);
    expect(toggleBoost([BOOST_NONE], 'shower')).toEqual(['shower']);
    expect(toggleBoost(['shower'], 'shower')).toEqual([]);
  });
  it('項目ごとの回数と、変化（やったあと − 朝の調子）の平均', () => {
    const es = [
      en('2026-11-01', { problemRatings: { m: 2 }, boost: { actions: ['shower'], after: 4 } }),
      en('2026-11-02', { problemRatings: { m: 3 }, boost: { actions: ['shower', 'bz'], after: 4 } }),
      en('2026-11-03', { problemRatings: { m: 3 }, boost: { actions: [BOOST_NONE], after: 3 } }),
      en('2026-11-04', { problemRatings: { m: 1 }, boost: { actions: ['shower'] } }), // やったあとの調子なし
    ];
    const rows = boostSummary(es, 'm', DEFAULT_BOOST_ACTIONS);
    const by = (id: string) => rows.find((r) => r.id === id)!;
    expect(by('shower')).toMatchObject({ used: 3, measured: 2, meanDelta: 1.5 });
    expect(by('bz')).toMatchObject({ used: 1, measured: 1, meanDelta: 1 });
    expect(by(BOOST_NONE)).toMatchObject({ used: 1, meanDelta: 0 });
    expect(rows.find((r) => r.id === 'univ')).toBeUndefined(); // 使っていないものは出さない
  });
});

describe('今日の画面：朝の調子が低いとき', () => {
  async function setup(name: string) {
    const repo = createRepo(new BuhiLogDB(name));
    const m = await repo.addProblem('朝の調子', undefined, '困りごと', '一日の調子');
    return { repo, m };
  }
  const openTab = async (user: ReturnType<typeof userEvent.setup>) => { await user.click(await screen.findByRole('tab', { name: /困りごと/ })); };

  it('3以下を選ぶと、その場で上げる方法が出る。4以上では出ない', async () => {
    const user = userEvent.setup();
    const { repo } = await setup('boost1');
    render(<Today repo={repo} initialDate="2026-11-12" />);
    await openTab(user);
    const g = await screen.findByRole('radiogroup', { name: '朝の調子の調子' });
    expect(screen.queryByRole('group', { name: '調子を上げる方法' })).toBeNull();
    await user.click(within(g).getByRole('radio', { name: '4' }));
    expect(screen.queryByRole('group', { name: '調子を上げる方法' })).toBeNull();
    await user.click(within(g).getByRole('radio', { name: '3' }));
    const card = screen.getByRole('group', { name: '調子を上げる方法' });
    for (const n of ['シャワーを浴びる', "B'zの動画をみる", '大学の時の動画をみる', '何もしなかった']) expect(within(card).getByRole('checkbox', { name: n })).toBeInTheDocument();
    expect(within(card).queryByRole('radiogroup', { name: 'やったあとの調子' })).toBeNull(); // 何も選ぶまでは出ない
  });

  it('やったことと、やったあとの調子を保存でき、開き直しても残る。「何もしなかった」は排他', async () => {
    const user = userEvent.setup();
    const { repo, m } = await setup('boost2');
    render(<Today repo={repo} initialDate="2026-11-12" />);
    await openTab(user);
    await user.click(within(await screen.findByRole('radiogroup', { name: '朝の調子の調子' })).getByRole('radio', { name: '2' }));
    const card = screen.getByRole('group', { name: '調子を上げる方法' });
    await user.click(within(card).getByRole('checkbox', { name: '何もしなかった' }));
    await user.click(within(card).getByRole('checkbox', { name: 'シャワーを浴びる' }));
    expect(within(card).getByRole('checkbox', { name: /何もしなかった/ })).toHaveAttribute('aria-checked', 'false');
    await user.click(within(card).getByRole('checkbox', { name: "B'zの動画をみる" }));
    await user.click(within(within(card).getByRole('radiogroup', { name: 'やったあとの調子' })).getByRole('radio', { name: '4' }));
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(async () => expect((await repo.getEntry('2026-11-12'))?.boost).toEqual({ actions: ['shower', 'bz'], after: 4 }));
    expect((await repo.getEntry('2026-11-12'))?.problemRatings[m.id]).toBe(2);
  });

  it('CSVにも出る', async () => {
    const { repo, m } = await setup('boost3');
    await repo.saveEntry({ localDate: '2026-11-12', problemRatings: { [m.id]: 2 }, problemNotes: {}, approachStatuses: {}, boost: { actions: ['shower'], after: 4 } });
    const csv = buildCsv(await buildBackup(repo));
    expect(csv).toContain('"2026-11-12","調子を上げる方法","シャワーを浴びる","4"');
  });
});

describe('管理画面：上げる方法の一覧', () => {
  it('追加・はずす・元に戻すができ、保存される', async () => {
    const user = userEvent.setup();
    const repo = createRepo(new BuhiLogDB('boost-manage'));
    render(<Manage repo={repo} />);
    const sec = await screen.findByRole('region', { name: '調子を上げる方法の設定' });
    await user.type(within(sec).getByLabelText('新しい上げる方法'), '散歩');
    await user.click(within(sec).getByRole('button', { name: '追加' }));
    await waitFor(async () => expect(boostActionsOf((await repo.getSettings()).boostActions).map((a) => a.name)).toContain('散歩'));
    const li = within(sec).getByText('散歩').closest('li')!;
    await user.click(within(li).getByRole('button', { name: 'はずす' }));
    await waitFor(async () => expect((await repo.getSettings()).boostActions?.find((a) => a.name === '散歩')?.archivedAt).toBeTruthy());
  });
});
