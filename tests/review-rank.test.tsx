import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { Review } from '../src/features/Review';
import { addDays, toLocalDate } from '../src/domain/date';

async function seed(name: string, days: number) {
  const repo = createRepo(new BuhiLogDB(name));
  const p = await repo.addProblem('頭痛', undefined, '困りごと', 'からだ');
  const yoga = await repo.addApproach('朝ヨガ', [], undefined, '朝要因'); // 対象の困りごとを設定していなくても比べる
  const drink = await repo.addApproach('前日にお酒を飲んだ', [], undefined, '前夜要因');
  await repo.addApproach('めったにしない', [], undefined, '朝要因');
  const today = toLocalDate();
  for (let i = 0; i < days; i++) {
    const yogaDone = i % 2 === 0, drank = i % 5 === 0;
    const y = Math.max(1, Math.min(5, 3 + (yogaDone ? 1 : -1) + (drank ? -1 : 0)));
    await repo.saveEntry({
      localDate: addDays(today, -i), problemRatings: { [p.id]: y }, problemNotes: {},
      approachStatuses: { [yoga.id]: yogaDone ? 'done' : 'not_done', [drink.id]: drank ? 'done' : 'not_done' },
      sleepHours: 6 + (i % 4), // 睡眠時間も記録
    });
  }
  return repo;
}

describe('ふりかえり: 関連がありそうな要因', () => {
  it('上位の要因が向き（＋/－）つきで並び、押すと具体の内容が開く', async () => {
    const repo = await seed('rk1', 40);
    const user = userEvent.setup();
    render(<Review repo={repo} />);
    await user.click(await screen.findByRole('radio', { name: '直近28日' }));
    const items = screen.getAllByRole('listitem').filter((li) => li.querySelector('.cand'));
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(5);
    const text = items.map((li) => li.textContent).join('|');
    expect(text).toContain('朝ヨガ');
    expect(text).toContain('実施した日は、調子が高め（良い）傾向'); // 正の関連
    expect(text).toContain('調子が低め（悪い）傾向'); // 負の関連（お酒）
    expect(text).not.toContain('めったにしない'); // 実施した日が少なすぎる要因は出さない
    // 詳細は最初は閉じている → 押すと開く
    expect(screen.queryByText(/実施した日：調子の平均/)).toBeNull();
    const yogaBtn = within(items.find((li) => li.textContent!.includes('朝ヨガ'))!).getByRole('button');
    expect(yogaBtn).toHaveAttribute('aria-expanded', 'false');
    await user.click(yogaBtn);
    expect(yogaBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/実施した日：調子の平均/)).toBeInTheDocument();
    expect(screen.getByText(/実施しなかった日：調子の平均/)).toBeInTheDocument();
    expect(screen.getAllByText(/原因や効果を示すものではありません/).length).toBeGreaterThan(0);
  });

  it('「全期間」を選ぶと、最初の記録の日から今日までを対象にする', async () => {
    const repo = await seed('rk3', 40);
    const user = userEvent.setup();
    render(<Review repo={repo} />);
    await user.click(await screen.findByRole('radio', { name: '全期間' }));
    expect(await screen.findByText(/全期間（40日間）のうち評価のある40日分/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').some((li) => li.textContent!.includes('朝ヨガ'))).toBe(true);
  });

  it('記録が足りないときは、並べずに、必要な記録の目安を案内する', async () => {
    const repo = await seed('rk2', 6);
    render(<Review repo={repo} />);
    expect(await screen.findByText(/まだ比べられる記録が足りません。要因ごとに/)).toBeInTheDocument();
    expect(screen.queryByText(/実施した日は、調子が高め/)).toBeNull();
  });
});
