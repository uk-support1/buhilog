import Dexie from 'dexie';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { buildBackup, buildCsv, parseBackup, restoreBackup } from '../src/db/backup';
import { History } from '../src/features/History';
import { Today } from '../src/features/Today';
import { buildGroups } from '../src/domain/groups';
import { ensureMedications, DOSE_OPTIONS } from '../src/domain/medications';
import { groupProgress } from '../src/domain/progress';
import { toLocalDate } from '../src/domain/date';
import type { DailyEntry, Problem } from '../src/domain/types';

let n = 0;
const nid = () => `m${n++}`;
const prob = (id: string, name: string): Problem => ({ id, name, order: 0, group: '困りごと', createdAt: 0, updatedAt: 0 });
const en = (d: string, extra: Partial<DailyEntry> = {}): DailyEntry => ({ id: d, localDate: d, problemRatings: {}, problemNotes: {}, approachStatuses: {}, createdAt: 0, updatedAt: 0, ...extra });

describe('ensureMedications', () => {
  it('3つの量の薬（基本量つき）・コンサータ・頭痛の頓服2つを作る。頭痛がなければ頓服は作らない', () => {
    const r = ensureMedications([prob('p1', '頭痛')], [], [], nid, 1);
    const by = (name: string) => r.medications.find((m) => m.name === name)!;
    expect(by('クービビック')).toMatchObject({ kind: 'dose', baseDose: 50, unit: 'mg', group: '前夜要因' });
    expect(by('セルトラリン')).toMatchObject({ kind: 'dose', baseDose: 50, group: '前夜要因' });
    expect(by('トラゾドン')).toMatchObject({ kind: 'dose', baseDose: 25, group: '前夜要因' });
    expect(by('コンサータ')).toMatchObject({ kind: 'taken', group: '朝要因' });
    expect(by('アセトアミノフェン')).toMatchObject({ kind: 'taken', linkedProblemId: 'p1' });
    expect(by('ロキソニン')).toMatchObject({ kind: 'taken', linkedProblemId: 'p1' });
    expect(r.medications.map((m) => m.order)).toEqual([0, 1, 2, 3, 4, 5]); // 並びは依頼の順
    const none = ensureMedications([prob('p2', '肩のつらさ')], [], [], nid, 1);
    expect(none.medications.map((m) => m.name)).toEqual(['クービビック', 'セルトラリン', 'トラゾドン', 'コンサータ']);
    expect([...DOSE_OPTIONS]).toEqual([0, 12.5, 25, 37.5, 50]);
  });

  it('旧い「【服薬】…」のメモから、読み取れた分だけを新しい記録に移し、読み取れなかった分は文字のまま残す。何度やっても同じ', () => {
    const entries = [
      en('2026-05-01', { noteOther: '【服薬】前日: セルトラリン37.5／デエビゴ10／クービビック25／トラゾドン25 ・当日朝: コンサータ7:00／セルトラリン37.5\n【マルチタスクをやらない】やりすぎ' }),
      en('2026-05-02', { noteOther: '【服薬】前日: トラゾドン50' }),
      en('2026-05-03', { noteOther: '【服薬】当日朝: コンサータ:かわ２つ' }), // 読み取れない → そのまま
      en('2026-05-04', { noteOther: '服薬のこと', medIntake: {} }),
      en('2026-05-05', { noteOther: '【服薬】 ・当日朝: コンサータ6:30' }), // 実データの形（前日なし・朝だけ）
      en('2026-05-06', { noteOther: '【服薬】前日: 他の薬メモ ・当日朝: コンサータ:かわ２つ' }), // 全部読み取れない → 元のまま
    ];
    const r = ensureMedications([prob('p1', '頭痛')], [], entries, nid, 1);
    const id = (name: string) => r.medications.find((m) => m.name === name)!.id;
    const e1 = r.entries[0];
    expect(e1.medIntake).toEqual({ [id('セルトラリン')]: 37.5, [id('クービビック')]: 25, [id('トラゾドン')]: 25, [id('コンサータ')]: 1 });
    expect(e1.noteOther).toBe('【服薬】前日: デエビゴ10 ・当日朝: セルトラリン37.5\n【マルチタスクをやらない】やりすぎ');
    expect(r.entries[1].medIntake).toEqual({ [id('トラゾドン')]: 50 });
    expect(r.entries[1].noteOther).toBeUndefined(); // 全部移したのでメモの行は消える
    expect(r.entries[2]).toBe(entries[2]); // 読み取れなければ変更しない（文字も消さない）
    expect(r.entries[4].medIntake).toEqual({ [id('コンサータ')]: 1 });
    expect(r.entries[4].noteOther).toBeUndefined();
    expect(r.entries[5]).toBe(entries[5]);
    expect(r.entries[3].noteOther).toBe('服薬のこと');
    const again = ensureMedications([prob('p1', '頭痛')], r.medications, r.entries, nid, 2);
    expect(again.changed).toBe(false);
    expect(again.entries).toEqual(r.entries);
    // すでに入力済みの値は上書きしない
    const manual = ensureMedications([prob('p1', '頭痛')], r.medications, [en('2026-06-01', { noteOther: '【服薬】前日: セルトラリン25', medIntake: { [id('セルトラリン')]: 50 } })], nid, 3);
    expect(manual.entries[0].medIntake?.[id('セルトラリン')]).toBe(50);
  });
});

describe('旧データの引き継ぎ（DB v5 → v6 / バックアップ）', () => {
  it('DBを開くと服薬の項目が加わり、メモの服薬が移る。ほかの記録は変わらない', async () => {
    const legacy = new Dexie('legacy-v6');
    const stores = { problems: 'id, order, archivedAt', approaches: 'id, archivedAt', dailyEntries: 'id, &localDate', settings: 'key' };
    [1, 2, 3, 4, 5].forEach((v) => legacy.version(v).stores(stores));
    await legacy.table('problems').add(prob('p1', '頭痛'));
    await legacy.table('dailyEntries').add(en('2026-05-01', { problemRatings: { p1: 4 }, noteOther: '【服薬】前日: セルトラリン50' }));
    await legacy.table('settings').add({ key: 'app', schemaVersion: 5, onboardingCompleted: true, backupReminderDays: 14 });
    legacy.close();
    const repo = createRepo(new BuhiLogDB('legacy-v6'));
    const meds = await repo.listMedications();
    expect(meds.map((m) => m.name)).toEqual(['クービビック', 'セルトラリン', 'トラゾドン', 'コンサータ', 'アセトアミノフェン', 'ロキソニン']);
    const e = await repo.getEntry('2026-05-01');
    expect(e?.problemRatings).toEqual({ p1: 4 });
    expect(e?.medIntake).toEqual({ [meds.find((m) => m.name === 'セルトラリン')!.id]: 50 });
    expect(e?.noteOther).toBeUndefined();
    expect((await repo.getSettings()).schemaVersion).toBe(6);
  });

  it('バックアップの往復で服薬の項目と記録が保たれ、CSVにも出る。存在しない薬を指す記録は拒否する', async () => {
    const db = new BuhiLogDB('med-rt');
    const repo = createRepo(db);
    await repo.addProblem('頭痛', undefined, '困りごと');
    await db.medications.bulkAdd(ensureMedications(await repo.listProblems(), [], [], nid, 1).medications);
    const meds = await repo.listMedications();
    const sert = meds.find((m) => m.name === 'セルトラリン')!, loxo = meds.find((m) => m.name === 'ロキソニン')!;
    await repo.saveEntry({ localDate: '2026-05-01', problemRatings: {}, problemNotes: {}, approachStatuses: {}, medIntake: { [sert.id]: 37.5, [loxo.id]: 1 } });
    const b = await buildBackup(repo);
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const db2 = new BuhiLogDB('med-rt2');
    await restoreBackup(db2, r.backup);
    expect((await createRepo(db2).listMedications()).map((m) => m.name)).toContain('ロキソニン');
    expect((await createRepo(db2).getEntry('2026-05-01'))?.medIntake).toEqual({ [sert.id]: 37.5, [loxo.id]: 1 });
    const csv = buildCsv(b);
    expect(csv).toContain('"服薬","セルトラリン","37.5","mg"');
    expect(csv).toContain('"服薬","ロキソニン","飲んだ"');
    const bad = { ...b, dailyEntries: [{ ...b.dailyEntries[0], medIntake: { ghost: 1 } }] };
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
  });

  it('旧いバックアップ（服薬の項目なし）を読み込むと、項目が加わる', () => {
    const old = { formatVersion: 2, exportedAt: '2026-10-22T10:00:00Z', problems: [prob('p1', '頭痛')], approaches: [], dailyEntries: [], settings: { schemaVersion: 5, onboardingCompleted: true, backupReminderDays: 14 } };
    const r = parseBackup(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.medications.map((m) => m.name)).toContain('コンサータ');
  });
});

async function setup(name: string) {
  const db = new BuhiLogDB(name);
  const repo = createRepo(db);
  const head = await repo.addProblem('頭痛', undefined, '困りごと');
  await repo.addApproach('前日にお酒を飲んだ', [head.id], undefined, '前夜要因');
  await repo.addApproach('朝ヨガ', [head.id], undefined, '朝要因');
  await db.medications.bulkAdd(ensureMedications(await repo.listProblems(), [], [], nid, 1).medications);
  return { db, repo, head, meds: await repo.listMedications() };
}

describe('今日の画面: 服薬', () => {
  it('「すべて飲んだ」で基本量が入り、量は0〜50mgから選べて、保存される', async () => {
    const { repo, meds } = await setup('md1');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-08-01" />);
    await user.click(await screen.findByRole('tab', { name: /前夜要因/ }));
    const sert = screen.getByLabelText('セルトラリンの量') as HTMLSelectElement;
    expect(Array.from(sert.options).map((o) => o.value)).toEqual(['', '0', '12.5', '25', '37.5', '50']);
    expect(sert).toHaveValue(''); // 最初は未入力
    expect(screen.getByRole('tab', { name: /前夜要因0\/4/ })).toBeInTheDocument(); // お酒1 + 服薬3
    await user.click(screen.getByRole('button', { name: /すべて飲んだ（基本の量を入れる）/ }));
    expect(screen.getByLabelText('クービビックの量')).toHaveValue('50');
    expect(sert).toHaveValue('50');
    expect(screen.getByLabelText('トラゾドンの量')).toHaveValue('25');
    expect(screen.getByRole('tab', { name: /前夜要因3\/4/ })).toBeInTheDocument();
    await user.selectOptions(sert, '37.5'); // 量を変える
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    const id = (nm: string) => meds.find((m) => m.name === nm)!.id;
    expect((await repo.getEntry('2026-08-01'))?.medIntake).toEqual({ [id('クービビック')]: 50, [id('セルトラリン')]: 37.5, [id('トラゾドン')]: 25 });
  });

  it('頭痛の欄に「日中に飲んだ薬」が出て、押すと飲んだ、もう一度押すと外れる。朝要因にはコンサータ', async () => {
    const { repo, meds } = await setup('md2');
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-08-02" />);
    await user.click(await screen.findByRole('tab', { name: /困りごと/ }));
    const grp = screen.getByRole('group', { name: '頭痛のために日中に飲んだ薬' });
    const ace = within(grp).getByRole('button', { name: 'アセトアミノフェン' });
    const lox = within(grp).getByRole('button', { name: 'ロキソニン' });
    await user.click(ace);
    await user.click(lox);
    await user.click(lox); // 外す
    expect(ace).toHaveAttribute('aria-pressed', 'true');
    expect(lox).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('tab', { name: /朝要因/ }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'コンサータ' })).getByRole('radio', { name: '飲んだ' }));
    expect(screen.queryByRole('button', { name: /すべて飲んだ/ })).toBeNull(); // 1つだけのカードにはまとめボタンを出さない
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    const id = (nm: string) => meds.find((m) => m.name === nm)!.id;
    expect((await repo.getEntry('2026-08-02'))?.medIntake).toEqual({ [id('アセトアミノフェン')]: 1, [id('コンサータ')]: 1 });
  });
});

describe('履歴の数え方・分析', () => {
  it('履歴の大分類の入力数に、服薬も含まれる（頓服は含めない）', async () => {
    const { repo, meds, head } = await setup('md3');
    const id = (nm: string) => meds.find((m) => m.name === nm)!.id;
    const today = toLocalDate();
    const entry = en(today, { medIntake: { [id('クービビック')]: 50, [id('セルトラリン')]: 50, [id('ロキソニン')]: 1 } });
    const groups = buildGroups(await repo.listProblems(), await repo.listApproaches(), []);
    const p = Object.fromEntries(groupProgress(entry, groups, meds).map((x) => [x.name, `${x.filled}/${x.total}`]));
    expect(p['前夜要因']).toBe('2/4'); // お酒(未入力)+服薬3 のうち2つ
    expect(p['朝要因']).toBe('0/2'); // 朝ヨガ + コンサータ
    expect(p['困りごと']).toBe('0/1'); // 頓服(ロキソニン)は数えない
    expect(head.id).toBeTruthy();
    await repo.saveEntry({ localDate: today, problemRatings: {}, problemNotes: {}, approachStatuses: {}, medIntake: entry.medIntake });
    render(<History repo={repo} onEdit={() => {}} />);
    expect(await screen.findByText('前夜 2/4')).toBeInTheDocument();
  });
});
