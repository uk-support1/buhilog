import { z } from 'zod';
import type { Repo } from './repo';
import type { BuhiLogDB } from './db';
import { convertLegacyRatings } from '../domain/scale';
import {
  AppSettingsSchema, ApproachSchema, DailyEntrySchema, ProblemSchema,
  type AppSettings, type Approach, type DailyEntry, type Problem,
} from '../domain/types';

export const FORMAT_VERSION = 2;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

const BackupSchema = z.object({
  formatVersion: z.literal(2),
  exportedAt: z.string(),
  problems: z.array(ProblemSchema),
  approaches: z.array(ApproachSchema),
  dailyEntries: z.array(DailyEntrySchema),
  settings: AppSettingsSchema,
});
export type Backup = z.infer<typeof BackupSchema>;

export async function buildBackup(repo: Repo): Promise<Backup> {
  return {
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    problems: await repo.listProblems(true),
    approaches: await repo.listApproaches(true),
    dailyEntries: await repo.listEntries(),
    settings: await repo.getSettings(),
  };
}

export type ParseResult =
  | { ok: true; backup: Backup; summary: { problems: number; approaches: number; dailyEntries: number; exportedAt: string } }
  | { ok: false; errors: string[] };

/** 復元前の検証: スキーマ・重複・参照整合性。DBには一切触れない。 */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, errors: ['ファイルが大きすぎます。'] };
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { ok: false, errors: ['JSONとして読み取れませんでした。'] }; }
  // 旧形式(formatVersion 1: 困りごとが0〜10で0が良い)は、1〜5(5が良い)へ変換して読み込む
  if (json && typeof json === 'object' && (json as { formatVersion?: unknown }).formatVersion === 1) {
    const j = json as { formatVersion: number; dailyEntries?: { problemRatings?: Record<string, number | null> }[]; problems?: { description?: string }[]; settings?: { schemaVersion?: number } };
    j.formatVersion = 2;
    for (const e of j.dailyEntries ?? []) e.problemRatings = convertLegacyRatings(e.problemRatings);
    for (const p of j.problems ?? []) if (p.description) p.description = p.description.replace('（0＝よく眠れた）', '（5＝よく眠れた）');
    if (j.settings) j.settings.schemaVersion = 2;
  }
  const r = BackupSchema.safeParse(json);
  if (!r.success) {
    return { ok: false, errors: ['ぶひろぐのバックアップ形式ではないか、内容に不正な値があります。', ...r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`)] };
  }
  const b = r.data;
  const errors: string[] = [];
  const dup = (xs: string[]) => new Set(xs).size !== xs.length;
  if (dup(b.problems.map((p) => p.id))) errors.push('困りごとのIDが重複しています。');
  if (dup(b.approaches.map((a) => a.id))) errors.push('アプローチのIDが重複しています。');
  if (dup(b.dailyEntries.map((e) => e.id))) errors.push('記録のIDが重複しています。');
  if (dup(b.dailyEntries.map((e) => e.localDate))) errors.push('同じ日付の記録が複数あります。');
  const pids = new Set(b.problems.map((p) => p.id));
  const aids = new Set(b.approaches.map((a) => a.id));
  if (b.approaches.some((a) => a.linkedProblemIds.some((id) => !pids.has(id)))) errors.push('存在しない困りごとを参照するアプローチがあります。');
  for (const e of b.dailyEntries) {
    const bad =
      Object.keys(e.problemRatings).some((k) => !pids.has(k)) ||
      Object.keys(e.problemNotes).some((k) => !pids.has(k)) ||
      Object.keys(e.approachStatuses).some((k) => !aids.has(k));
    if (bad) { errors.push(`${e.localDate} の記録に、存在しない項目への参照があります。`); break; }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, backup: b, summary: { problems: b.problems.length, approaches: b.approaches.length, dailyEntries: b.dailyEntries.length, exportedAt: b.exportedAt } };
}

/** 全置換。単一トランザクションなので、途中で失敗すれば元のデータは変更されない。 */
export async function restoreBackup(db: BuhiLogDB, b: Backup): Promise<void> {
  await db.transaction('rw', [db.problems, db.approaches, db.dailyEntries, db.settings], async () => {
    await Promise.all([db.problems.clear(), db.approaches.clear(), db.dailyEntries.clear(), db.settings.clear()]);
    await db.problems.bulkAdd(b.problems as Problem[]);
    await db.approaches.bulkAdd(b.approaches as Approach[]);
    await db.dailyEntries.bulkAdd(b.dailyEntries as DailyEntry[]);
    // 復元した内容は、そのバックアップ（作成日時）と同じ状態。最後のバックアップ日を失わせず、古くならないようにする
    const exported = Date.parse(b.exportedAt);
    const lastBackupAt = Math.max(b.settings.lastBackupAt ?? 0, Number.isNaN(exported) ? 0 : exported) || undefined;
    await db.settings.put({ ...(b.settings as AppSettings), lastBackupAt, backupSnoozedUntil: undefined, onboardingCompleted: true, key: 'app' });
  });
}

// ---- CSV ----
/** 表計算ソフトでの式実行（CSVインジェクション）を防ぎ、全項目を引用符で囲む */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const STATUS_JA = { done: '実施した', not_done: '実施しなかった', unknown: '未回答' } as const;

export function buildCsv(b: Backup): string {
  const pname = new Map(b.problems.map((p) => [p.id, p.name]));
  const aname = new Map(b.approaches.map((a) => [a.id, a.name]));
  const rows: (string | number)[][] = [['日付', '種類', '項目', '値', 'メモ']];
  for (const e of b.dailyEntries) {
    for (const [id, r] of Object.entries(e.problemRatings)) rows.push([e.localDate, '困りごと(1-5, 5が良い)', pname.get(id) ?? id, r ?? '未入力', e.problemNotes[id] ?? '']);
    for (const [id, s] of Object.entries(e.approachStatuses)) rows.push([e.localDate, 'アプローチ', aname.get(id) ?? id, STATUS_JA[s], '']);
    if (e.sleepHours != null) rows.push([e.localDate, '生活', '睡眠時間(時間)', e.sleepHours, '']);
    if (e.bedtime) rows.push([e.localDate, '睡眠', '就寝時刻', e.bedtime, '']);
    if (e.wakeTime) rows.push([e.localDate, '睡眠', '起床時刻', e.wakeTime, '']);
    if (e.napHours != null) rows.push([e.localDate, '睡眠', '昼寝(時間)', e.napHours, '']);
    e.awakenings?.forEach((n, i) => { if (n != null) rows.push([e.localDate, '睡眠', `中途覚醒 ${i + 1}〜${i + 2}時間目(回)`, n, '']); });
    if (e.stressRating != null) rows.push([e.localDate, '生活', 'ストレス(0-10)', e.stressRating, '']);
    if (e.note) rows.push([e.localDate, '生活', '自由メモ', '', e.note]);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function daysSince(ts: number | undefined, now = Date.now()): number | null {
  return ts == null ? null : Math.floor((now - ts) / 86_400_000);
}

/** 記録があり、最終バックアップから設定日数を超えた（または未実施）ならtrue */
export function backupDue(hasEntries: boolean, s: AppSettings, now = Date.now()): boolean {
  if (!hasEntries) return false;
  if (s.backupSnoozedUntil != null && s.backupSnoozedUntil > now) return false;
  const d = daysSince(s.lastBackupAt, now);
  return d == null || d >= s.backupReminderDays;
}
