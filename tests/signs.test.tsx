import Dexie from 'dexie';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { parseBackup } from '../src/db/backup';
import { Today } from '../src/features/Today';
import { Review } from '../src/features/Review';
import { rankFactors } from '../src/domain/correlation';
import { addDays, toLocalDate } from '../src/domain/date';
import { buildNarrative } from '../src/domain/narrative';
import { ensureVitalitySigns, SIGN_GROUP } from '../src/domain/signs';
import { signStory, summarizeSign } from '../src/domain/signSummary';
import type { Approach, DailyEntry, Problem } from '../src/domain/types';

let n = 0;
const newId = () => `id${n++}`;
const prob = (id: string, name: string, extra: Partial<Problem> = {}): Problem => ({ id, name, order: 0, createdAt: 0, updatedAt: 0, ...extra });

describe('ensureVitalitySigns（いきいきサインの整え方）', () => {
  it('なければ作り、「意識した」項目と対にし、並びは困りごとの前', () => {
    const r = ensureVitalitySigns([prob('p1', '頭痛', { group: '困りごと' })], [], ['日中要因', '困りごと'], newId, 1);
    const back = r.problems.find((p) => p.name === '背筋の伸び')!;
    const smile = r.problems.find((p) => p.name === '口角')!;
    expect([back.group, smile.group]).toEqual([SIGN_GROUP, SIGN_GROUP]);
    expect(r.approaches.map((a) => a.name).sort()).toEqual(['口角を意識した', '背筋を意識した']);
    expect(r.approaches.find((a) => a.id === back.pairedApproachId)?.name).toBe('背筋を意識した');
    expect(r.groupOrder).toEqual(['日中要因', SIGN_GROUP, '困りごと']);
    expect(r.problems.find((p) => p.name === '頭痛')).toMatchObject({ group: '困りごと' }); // 他の項目は変えない
  });

  it('すでにある「背筋の伸び」は、移すだけ（IDと記録を保つ）。何度やっても同じ', () => {
    const existing = prob('keep', '背筋の伸び', { group: '困りごと', section: 'からだ', order: 9 });
    const once = ensureVitalitySigns([existing], [], ['困りごと'], newId, 1);
    expect(once.problems.find((p) => p.name === '背筋の伸び')).toMatchObject({ id: 'keep', group: SIGN_GROUP });
    expect(once.problems.find((p) => p.name === '背筋の伸び')?.section).toBeUndefined();
    const twice = ensureVitalitySigns(once.problems, once.approaches, once.groupOrder, newId, 2);
    expect(twice.changed).toBe(false);
    expect(twice.problems).toEqual(once.problems);
    expect(twice.approaches).toHaveLength(2);
  });
});

describe('旧データの引き継ぎ（DB v3 → v4 / バックアップ）', () => {
  it('DBを開くとサインが加わり、既存の項目と記録は変わらない', async () => {
    const legacy = new Dexie('legacy-v4');
    const stores = { problems: 'id, order, archivedAt', approaches: 'id, archivedAt', dailyEntries: 'id, &localDate', settings: 'key' };
    [1, 2, 3].forEach((v) => legacy.version(v).stores(stores));
    await legacy.table('problems').bulkAdd([
      { id: 'p1', name: '頭痛', group: '困りごと', order: 0, createdAt: 0, updatedAt: 0 },
      { id: 'p2', name: '背筋の伸び', group: '困りごと', section: 'からだ', order: 1, createdAt: 0, updatedAt: 0 },
    ]);
    await legacy.table('dailyEntries').add({ id: 'e1', localDate: '2026-05-01', problemRatings: { p1: 4, p2: 3 }, problemNotes: {}, approachStatuses: {}, createdAt: 0, updatedAt: 0 });
    await legacy.table('settings').add({ key: 'app', schemaVersion: 3, onboardingCompleted: true, backupReminderDays: 14, groupOrder: ['日中要因', '困りごと'] });
    legacy.close();
    const repo = createRepo(new BuhiLogDB('legacy-v4'));
    const ps = await repo.listProblems(true);
    expect(ps.find((p) => p.id === 'p2')).toMatchObject({ group: SIGN_GROUP });
    expect(ps.find((p) => p.name === '口角')).toBeTruthy();
    expect(ps.find((p) => p.id === 'p1')).toMatchObject({ name: '頭痛', group: '困りごと' });
    expect((await repo.getEntry('2026-05-01'))?.problemRatings).toEqual({ p1: 4, p2: 3 });
    expect((await repo.getSettings()).groupOrder).toEqual(['日中要因', SIGN_GROUP, '困りごと']);
    expect((await repo.getSettings()).schemaVersion).toBe(4);
  });

  it('旧いバックアップを読み込むときも、サインが加わる', () => {
    const old = {
      formatVersion: 2, exportedAt: '2026-10-22T10:00:00Z',
      problems: [{ id: 'p1', name: '頭痛', order: 0, group: '困りごと', createdAt: 0, updatedAt: 0 }], approaches: [],
      dailyEntries: [], settings: { schemaVersion: 3, onboardingCompleted: true, backupReminderDays: 14, groupOrder: ['困りごと'] },
    };
    const r = parseBackup(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.problems.filter((p) => p.group === SIGN_GROUP).map((p) => p.name).sort()).toEqual(['口角', '背筋の伸び']);
    expect(r.backup.approaches).toHaveLength(2);
    expect(r.backup.settings.groupOrder).toEqual([SIGN_GROUP, '困りごと']);
  });
});

describe('今日の画面: 状態と「意識した」を1つのまとまりで', () => {
  it('サインの中に「意識した？」が出て、試したことの一覧には重複して出ない。保存できる', async () => {
    const repo = createRepo(new BuhiLogDB('sg1'));
    await repo.addProblem('頭痛', undefined, '困りごと');
    const back = await repo.addProblem('背筋の伸び', undefined, SIGN_GROUP);
    const a = await repo.addApproach('背筋を意識した', [back.id], undefined, SIGN_GROUP);
    await repo.updateProblem(back.id, { pairedApproachId: a.id });
    const user = userEvent.setup();
    render(<Today repo={repo} initialDate="2026-06-10" />);
    await screen.findByRole('tablist');
    await user.click(screen.getByRole('tab', { name: new RegExp(SIGN_GROUP) }));
    expect(screen.getByText(/自然にできていた度合い/)).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: '背筋を意識した' });
    expect(screen.getAllByRole('radiogroup', { name: '背筋を意識した' })).toHaveLength(1); // 重複なし
    await user.click(within(group).getByRole('radio', { name: '意識した' }));
    await user.click(screen.getByRole('radiogroup', { name: '背筋の伸びの調子' }).querySelectorAll('button')[3]!); // 4
    await user.click(screen.getByRole('button', { name: /保存する/ }));
    await screen.findByText(/保存しました/);
    const e = await repo.getEntry('2026-06-10');
    expect(e?.problemRatings[back.id]).toBe(4);
    expect(e?.approachStatuses[a.id]).toBe('done');
  });
});

const END = '2026-06-30';
function loopData() {
  const problems: Problem[] = [prob('t', 'やる気'), prob('s', '口角', { pairedApproachId: 'sa', group: SIGN_GROUP })];
  const approaches: Approach[] = [{ id: 'sa', name: '口角を意識した', linkedProblemIds: ['s'], group: SIGN_GROUP, createdAt: 0, updatedAt: 0 }];
  let seed = 99;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const entries: DailyEntry[] = Array.from({ length: 40 }, (_, i) => {
    const practiced = i % 2 === 0;
    const state = Math.max(1, Math.min(5, Math.round(3 + (practiced ? 1 : -1) + (rnd() - 0.5))));
    const target = Math.max(1, Math.min(5, Math.round(state + (rnd() - 0.5))));
    return { id: `e${i}`, localDate: addDays(END, -(39 - i)), problemRatings: { s: state, t: target }, problemNotes: {}, approachStatuses: { sa: practiced ? 'done' : 'not_done' }, createdAt: 0, updatedAt: 0 };
  });
  return { problems, approaches, entries };
}

describe('好循環の候補（ふりかえり）', () => {
  it('他の困りごとを選ぶと、サインの「状態」と「意識した」が好循環の候補として出る', () => {
    const { problems, approaches, entries } = loopData();
    const sig = [{ id: 's', name: '口角', approachId: 'sa' }];
    const r = rankFactors(entries, approaches, 't', END, 56, sig);
    const state = r.all.find((c) => c.key === 'r:s')!;
    expect(state).toMatchObject({ kind: 'signal', loop: true, positive: true });
    expect(r.all.find((c) => c.key === 'a:sa')?.loop).toBe(true);
    expect(buildNarrative('やる気', state).headline).toContain('「口角」が良い状態の日ほど');
    expect(buildNarrative('やる気', state).reasons.join('')).toContain('好循環');
    // サイン自身を選んだときは、自分自身の状態は候補に出ない
    expect(rankFactors(entries, approaches, 's', END, 56, sig).all.some((c) => c.key === 'r:s')).toBe(false);
    expect(problems.length).toBe(2);
  });

  it('サインのまとめ: 「きっかけ」と「合図」を分けて文章にし、そろえば好循環の可能性を示す', () => {
    const { problems, approaches, entries } = loopData();
    const s = summarizeSign(entries, problems[1], approaches[0], problems[0], END, 56);
    expect(s.lever.enough).toBe(true);
    expect(s.toTarget?.enough).toBe(true);
    const story = signStory(s, 'やる気');
    expect(story.lines.join('\n')).toContain('【きっかけとして】意識した日は');
    expect(story.lines.join('\n')).toContain('【合図として】「口角」が良い日ほど、「やる気」の調子');
    expect(story.loop).toBe(true);
    expect(story.hint).toContain('好循環');
    // 記録が少ない場合は、必要な日数を案内する
    const few = summarizeSign(entries.slice(-6), problems[1], approaches[0], problems[0], END, 56);
    expect(signStory(few, 'やる気').lines.join('\n')).toContain('それぞれ5日分そろうと');
    expect(signStory(few, 'やる気').loop).toBe(false);
  });

  it('ふりかえり画面に「いきいきサイン」のカードと好循環のバッジが出る', async () => {
    const repo = createRepo(new BuhiLogDB('sg2'));
    const target = await repo.addProblem('やる気', undefined, '困りごと');
    const s = await repo.addProblem('口角', undefined, SIGN_GROUP);
    const a = await repo.addApproach('口角を意識した', [s.id], undefined, SIGN_GROUP);
    await repo.updateProblem(s.id, { pairedApproachId: a.id });
    const today = toLocalDate();
    for (let i = 0; i < 40; i++) {
      const practiced = i % 2 === 0;
      const st = practiced ? 5 : 2;
      await repo.saveEntry({ localDate: addDays(today, -i), problemRatings: { [s.id]: st, [target.id]: practiced ? 5 : 2 }, problemNotes: {}, approachStatuses: { [a.id]: practiced ? 'done' : 'not_done' } });
    }
    const user = userEvent.setup();
    render(<Review repo={repo} />);
    await user.selectOptions(await screen.findByRole('combobox'), target.id);
    await user.click(await screen.findByRole('radio', { name: '全期間' }));
    expect(await screen.findByRole('heading', { name: SIGN_GROUP })).toBeInTheDocument();
    expect(screen.getByText(/【きっかけとして】意識した日は/)).toBeInTheDocument();
    expect(screen.getAllByText('好循環の可能性').length).toBeGreaterThan(0);
  });
});
