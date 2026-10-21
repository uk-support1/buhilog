import Dexie, { type Table } from 'dexie';
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
  }
}

export const db = new BuhiLogDB();
