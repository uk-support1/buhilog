import Dexie from 'dexie';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { parseBackup } from '../src/db/backup';
import { Today } from '../src/features/Today';

const A = (name: string, linked: string[], group: string, quantity?: { unit: string; mode: 'select' | 'number'; max?: number }) => ({ name, linked, group, quantity });
async function setup(name: string) {
  const repo = createRepo(new BuhiLogDB(name));
  const sleep = await repo.addProblem('睡眠の質', undefined, '睡眠');
  await repo.updateProblem(sleep.id, { noteLabel: '理由', noteAlways: true });
  const p = await repo.addProblem('頭痛', undefined, '困りごと', 'からだ');
  const mk = async (x: ReturnType<typeof A>) => {
    const a = await repo.addApproach(x.name, [p.id], undefined, x.group);
    if (x.quantity) await repo.updateApproach(a.id, { quantity: x.quantity });
    return a;
  };
  const alcohol = await mk(A('前日にお酒を飲んだ', [p.id], '前夜要因', { unit: '杯', mode: 'select', max: 10 }));
  const pushup = await mk(A('腕立', [p.id], '運動要因', { unit: '回', mode: 'number' }));
  const plain = await mk(A('朝ヨガ', [p.id], '朝要因'));
  return { repo, sleep, p, alcohol, pushup, plain };
}

describe('量の入力（お酒=杯を選ぶ、運動=回数）', () => {
  it('「実施した」を選ぶと量の欄が出て、保存される。実施しなかった項目の量は保存しない', async () => {
    const { repo, alcohol, pushup, plain } = await setup('v3a');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-06-01" />);
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('tab', { name: /前夜要因/ }));
    expect(screen.queryByLabelText('前日にお酒を飲んだの量')).toBeNull(); // 実施するまで出ない
    await user.click(screen.getByRole('radio', { name: '実施した' }));
    const sel = screen.getByLabelText('前日にお酒を飲んだの量');
    expect(Array.from((sel as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['選ぶ', ...Array.from({ length: 10 }, (_, i) => `${i + 1}杯`)]);
    await user.selectOptions(sel, '3');
    await user.click(screen.getByRole('tab', { name: /運動要因/ }));
    await user.click(screen.getByRole('radio', { name: '実施した' }));
    await user.type(screen.getByLabelText('腕立の回数'), '30abc');
    expect(screen.getByLabelText('腕立の回数')).toHaveValue('30'); // 数字だけ
    await user.click(screen.getByRole('tab', { name: /朝要因/ }));
    await user.click(screen.getByRole('radio', { name: '実施しなかった' }));
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    const e = await repo.getEntry('2026-06-01');
    expect(e?.approachQuantities).toEqual({ [alcohol.id]: 3, [pushup.id]: 30 });
    expect(e?.approachStatuses[plain.id]).toBe('not_done');
  });

  it('「実施しなかった」に変えると、量は保存されない', async () => {
    const { repo, pushup } = await setup('v3b');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-06-02" />);
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('tab', { name: /運動要因/ }));
    await user.click(screen.getByRole('radio', { name: '実施した' }));
    await user.type(screen.getByLabelText('腕立の回数'), '20');
    await user.click(screen.getByRole('radio', { name: '実施しなかった' }));
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    expect((await repo.getEntry('2026-06-02'))?.approachQuantities).toBeUndefined();
    expect((await repo.getEntry('2026-06-02'))?.approachStatuses[pushup.id]).toBe('not_done');
  });
});

describe('睡眠タブ・メモ', () => {
  it('睡眠の質の「理由」欄が常に見え、保存される。分は10分単位', async () => {
    const { repo, sleep } = await setup('v3c');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-06-03" />);
    await screen.findByRole('tablist');
    const reason = screen.getByLabelText('睡眠の質の理由'); // 折りたたまれていない
    expect(reason).toBeVisible();
    expect(screen.queryByText('メモ', { selector: 'summary' })).toBeNull();
    await user.type(reason, 'まだ眠い');
    expect(screen.getByRole('tab', { name: /睡眠0\/4/ })).toBeInTheDocument(); // 初期値の表示だけでは「入力済み」にならない
    // 時刻は1つの選択（10分刻み・1日分）。就寝は18時始まり、起床は3時始まりで、夜をまたいでも並びが途切れない
    const bed = screen.getByLabelText('就寝時刻') as HTMLSelectElement;
    const values = Array.from(bed.options).map((o) => o.value).filter(Boolean);
    expect(values).toHaveLength(144);
    expect(values.every((x) => x.endsWith('0') && /^\d\d:\d0$/.test(x))).toBe(true); // 10分刻み
    expect(values.slice(0, 3)).toEqual(['18:00', '18:10', '18:20']);
    expect(values[values.indexOf('23:50') + 1]).toBe('00:00');
    expect(Array.from((screen.getByLabelText('起床時刻') as HTMLSelectElement).options)[1].value).toBe('03:00');
    expect(Array.from(bed.options).map((o) => o.textContent)).toContain('23:00');
    // 中途覚醒は縦並びの5行（6〜7時間目なし）
    expect(screen.getAllByText(/^\d〜\d時間目$/)).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    const e = await repo.getEntry('2026-06-03');
    expect(e?.problemNotes[sleep.id]).toBe('まだ眠い');
    // 初期値(23:00/7:00)の表示は、触っていないので、記録されない
    expect(e?.bedtime).toBeUndefined();
    expect(e?.wakeTime).toBeUndefined();
    expect(e?.sleepHours).toBeUndefined();
  });

  it('メモは「出来事」「気づき」「その他」の3つで、ストレスの入力欄はない', async () => {
    const { repo } = await setup('v3d');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-06-04" />);
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('tab', { name: 'メモ' }));
    expect(screen.queryByText(/ストレス/)).toBeNull();
    await user.type(screen.getByLabelText('出来事'), '散歩した');
    await user.type(screen.getByLabelText('気づき'), '朝の光が良い');
    await user.type(screen.getByLabelText('その他'), '特になし');
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    expect(await repo.getEntry('2026-06-04')).toMatchObject({ noteEvents: '散歩した', noteInsights: '朝の光が良い', noteOther: '特になし' });
  });

  it('初期値の表示は薄く出て、選択の開始位置は23時・7時。触った側だけが入力済みになる', async () => {
    const { repo } = await setup('v3e');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-06-05" />);
    await screen.findByRole('tablist');
    expect(screen.getByLabelText('就寝時刻')).toHaveValue('23:00'); // 選択の開始位置
    expect(screen.getByLabelText('就寝時刻')).toHaveClass('ghost'); // 薄い（未入力）
    expect(screen.getByLabelText('起床時刻')).toHaveValue('07:00');
    expect(screen.getByRole('tab', { name: /睡眠0\/4/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('就寝時刻'), '23:30'); // 就寝だけ触る
    expect(screen.getByLabelText('就寝時刻')).not.toHaveClass('ghost');
    expect(screen.getByLabelText('起床時刻')).toHaveClass('ghost'); // 起床は未入力のまま
    expect(screen.getByRole('tab', { name: /睡眠1\/4/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    const e = await repo.getEntry('2026-06-05');
    expect(e?.bedtime).toBe('23:30');
    expect(e?.wakeTime).toBeUndefined(); // 触っていないので記録されない
  });

  it('「初期値のまま入力する」ボタンで、就寝23:00・起床7:00が入力済みになり、合計睡眠時間も計算される', async () => {
    const { repo } = await setup('v3f');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-06-06" />);
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('button', { name: /初期値.*のまま入力する/ }));
    expect(screen.getByRole('tab', { name: /睡眠2\/4/ })).toBeInTheDocument();
    expect(screen.getByText(/合計睡眠時間（自動）/).textContent).toMatch(/8 時間/);
    expect(screen.queryByRole('button', { name: /初期値.*のまま入力する/ })).toBeNull(); // 両方入力済みなら消える
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    expect(await repo.getEntry('2026-06-06')).toMatchObject({ bedtime: '23:00', wakeTime: '07:00', sleepHours: 8 });
  });
});

describe('旧データの引き継ぎ（v2 → v3）', () => {
  it('DBを開くと、中途覚醒は5区間に・旧メモは「その他」へ・睡眠の質は理由欄つきになる', async () => {
    const legacy = new Dexie('legacy-v3');
    const stores = { problems: 'id, order, archivedAt', approaches: 'id, archivedAt', dailyEntries: 'id, &localDate', settings: 'key' };
    legacy.version(1).stores(stores);
    legacy.version(2).stores(stores);
    await legacy.table('problems').bulkAdd([
      { id: 'p1', name: '睡眠の質', order: 0, createdAt: 0, updatedAt: 0 },
      { id: 'p2', name: '頭痛', order: 1, createdAt: 0, updatedAt: 0 },
    ]);
    await legacy.table('dailyEntries').add({
      id: 'e1', localDate: '2026-05-01', problemRatings: { p1: 4 }, problemNotes: {}, approachStatuses: {},
      awakenings: [0, 1, 0, 2, 0, 3], note: '古いメモ', stressRating: 5, createdAt: 0, updatedAt: 0,
    });
    legacy.close();
    const repo = createRepo(new BuhiLogDB('legacy-v3'));
    const e = await repo.getEntry('2026-05-01');
    expect(e?.awakenings).toEqual([0, 1, 0, 2, 0]);
    expect(e?.noteOther).toBe('古いメモ');
    expect((e as unknown as { note?: string }).note).toBeUndefined();
    expect(e?.stressRating).toBe(5); // ストレスの過去データは保持
    const ps = await repo.listProblems();
    expect(ps.find((p) => p.name === '睡眠の質')).toMatchObject({ noteLabel: '理由', noteAlways: true });
    expect(ps.find((p) => p.name === '頭痛')?.noteAlways).toBeUndefined();
  });

  it('旧形式のバックアップ（awakenings 6区間・note）も読み込める', () => {
    const old = {
      formatVersion: 2, exportedAt: '2026-10-22T10:00:00Z',
      problems: [{ id: 'p1', name: '睡眠の質', order: 0, createdAt: 0, updatedAt: 0 }], approaches: [],
      dailyEntries: [{ id: 'e1', localDate: '2026-05-01', problemRatings: { p1: 4 }, problemNotes: {}, approachStatuses: {}, awakenings: [1, 0, 0, 0, 0, 2], note: 'メモ', createdAt: 0, updatedAt: 0 }],
      settings: { schemaVersion: 2, onboardingCompleted: true, backupReminderDays: 14 },
    };
    const r = parseBackup(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.dailyEntries[0].awakenings).toEqual([1, 0, 0, 0, 0]);
    expect(r.backup.dailyEntries[0].noteOther).toBe('メモ');
    expect(r.backup.problems[0]).toMatchObject({ noteLabel: '理由', noteAlways: true });
  });
});

describe('時刻の選択（1つのホイール）', () => {
  it('10分刻み以外の既存の時刻（例: 22:35）も、そのまま表示され、保存し直しても変わらない', async () => {
    const { repo } = await setup('v3g');
    await repo.saveEntry({ localDate: '2026-06-07', problemRatings: {}, problemNotes: {}, approachStatuses: {}, bedtime: '22:35', wakeTime: '06:40' });
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-06-07" />);
    await screen.findByRole('tablist');
    expect(screen.getByLabelText('就寝時刻')).toHaveValue('22:35');
    expect(screen.getByLabelText('就寝時刻')).not.toHaveClass('ghost');
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    expect(await repo.getEntry('2026-06-07')).toMatchObject({ bedtime: '22:35', wakeTime: '06:40', sleepHours: 8.08 });
  });
});
