import Dexie, { type Table } from 'dexie';
import { legacyRatingToNew } from '../domain/scale';
import type { AppSettings, Approach, DailyEntry, Problem } from '../domain/types';

type SettingsRow = AppSettings & { key: 'app' };

export class BuhiLogDB extends Dexie {
  problems!: Table<Problem, string>;
  approaches!: Table<Approach, string>;
  dailyEntries!: Table<DailyEntry, string>;
  settings!: Table<SettingsRow, string>;

  constructor(name = 'buhilog') {
    super(name);
    // localDate を一意インデックスにして同日重複を防ぐ
    this.version(1).stores({
      problems: 'id, order, archivedAt',
      approaches: 'id, archivedAt',
      dailyEntries: 'id, &localDate',
      settings: 'key',
    });
    // v2: 困りごとの点数を 0〜10（0が良い）から 1〜5（5が良い）へ。既存の記録を一度だけ変換する。
    this.version(2)
      .stores({
        problems: 'id, order, archivedAt',
        approaches: 'id, archivedAt',
        dailyEntries: 'id, &localDate',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        await tx.table('dailyEntries').toCollection().modify((e: { problemRatings?: Record<string, number | null> }) => {
          const r = e.problemRatings ?? {};
          for (const k of Object.keys(r)) if (typeof r[k] === 'number') r[k] = legacyRatingToNew(r[k] as number);
          e.problemRatings = r;
        });
        await tx.table('problems').toCollection().modify((p: { description?: string }) => {
          if (p.description) p.description = p.description.replace('（0＝よく眠れた）', '（5＝よく眠れた）');
        });
        await tx.table('settings').toCollection().modify((s: { schemaVersion?: number }) => { s.schemaVersion = 2; });
      });
  }
}

export const db = new BuhiLogDB();
