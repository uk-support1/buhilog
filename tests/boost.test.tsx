import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { buildBackup, buildCsv } from '../src/db/backup';
import { boostActionsOf, BOOST_NONE } from '../src/domain/boost';

describe('上げる方法（記録の読み出しだけ残す）', () => {
  it('初期の一覧は4つで、「何もしなかった」が最後。保存した一覧でも最後に1つだけ', () => {
    expect(boostActionsOf().map((a) => a.name)).toEqual(['シャワーを浴びる', "B'zの動画をみる", '大学の時の動画をみる', '何もしなかった']);
    expect(boostActionsOf([{ id: 'x', name: '散歩' }]).map((a) => a.id)).toEqual(['x', BOOST_NONE]);
  });
  it('すでに記録した内容は、CSVに出る', async () => {
    const repo = createRepo(new BuhiLogDB('boost-csv'));
    const m = await repo.addProblem('朝の調子', undefined, '困りごと', '一日の調子');
    await repo.saveEntry({ localDate: '2026-11-12', problemRatings: { [m.id]: 2 }, problemNotes: {}, approachStatuses: {}, boost: { actions: ['shower'], after: 4 } });
    const csv = buildCsv(await buildBackup(repo));
    expect(csv).toContain('"2026-11-12","調子を上げる方法","シャワーを浴びる","4"');
  });
});
