import Dexie, { type Table } from 'dexie';
import { legacyRatingToNew } from '../domain/scale';
import { convertDayFactors } from '../domain/dayFactors';
import { ensureVitalitySigns } from '../domain/signs';
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
    // v3: 中途覚醒は5区間に（6〜7時間目を廃止）、メモを3つに分割（旧「自由メモ」は「その他」へ）、睡眠の質のメモは「理由」として常に表示。
    this.version(3)
      .stores({
        problems: 'id, order, archivedAt',
        approaches: 'id, archivedAt',
        dailyEntries: 'id, &localDate',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        await tx.table('dailyEntries').toCollection().modify((e: { awakenings?: unknown[]; note?: string; noteOther?: string }) => {
          if (Array.isArray(e.awakenings) && e.awakenings.length > 5) e.awakenings = e.awakenings.slice(0, 5);
          if (e.note) { e.noteOther = e.noteOther ? `${e.noteOther}\n${e.note}` : e.note; }
          delete e.note;
        });
        await tx.table('problems').toCollection().modify((p: { name?: string; noteLabel?: string; noteAlways?: boolean }) => {
          if (p.name === '睡眠の質') { p.noteLabel = '理由'; p.noteAlways = true; }
        });
        await tx.table('settings').toCollection().modify((s: { schemaVersion?: number }) => { s.schemaVersion = 3; });
      });
    // v4: 「いきいきサイン」（背筋の伸び・口角: 状態と「意識した」の2つの面）を追加。既存の項目・記録は変更しない。
    this.version(4)
      .stores({
        problems: 'id, order, archivedAt',
        approaches: 'id, archivedAt',
        dailyEntries: 'id, &localDate',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const problems = await tx.table('problems').toArray();
        const approaches = await tx.table('approaches').toArray();
        const settings = await tx.table('settings').get('app');
        const r = ensureVitalitySigns(problems, approaches, settings?.groupOrder, () => crypto.randomUUID(), Date.now());
        if (r.changed) {
          await tx.table('problems').bulkPut(r.problems);
          await tx.table('approaches').bulkPut(r.approaches);
          if (settings && r.groupOrder) await tx.table('settings').put({ ...settings, groupOrder: r.groupOrder });
        }
        await tx.table('settings').toCollection().modify((s: { schemaVersion?: number }) => { s.schemaVersion = 4; });
      });
    // v5: 日中要因の3項目（マルチタスク・コミュニケーション・誰かの役に立つ）を5段階評価へ。旧い記録は変換して引き継ぐ。
    this.version(5)
      .stores({
        problems: 'id, order, archivedAt',
        approaches: 'id, archivedAt',
        dailyEntries: 'id, &localDate',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const r = convertDayFactors(await tx.table('problems').toArray(), await tx.table('approaches').toArray(), await tx.table('dailyEntries').toArray(), () => crypto.randomUUID(), Date.now());
        if (r.changed) {
          await tx.table('problems').bulkPut(r.problems);
          await tx.table('approaches').bulkPut(r.approaches);
          await tx.table('dailyEntries').bulkPut(r.entries);
        }
        await tx.table('settings').toCollection().modify((s: { schemaVersion?: number }) => { s.schemaVersion = 5; });
      });
  }
}

export const db = new BuhiLogDB();
