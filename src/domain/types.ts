import { z } from 'zod';
import { isValidLocalDate } from './date';

export const MAX_NAME = 50;
export const MAX_TEXT = 2000;

const id = z.string().min(1).max(64);
const ts = z.number().int().nonnegative();
const rating = z.number().int().min(0).max(10);
/** 困りごとの点数: 1〜5（5が良い） */
const problemRating = z.number().int().min(1).max(5);
const localDate = z.string().refine(isValidLocalDate, '日付の形式が正しくありません');

export const ProblemSchema = z.object({
  id,
  name: z.string().trim().min(1).max(MAX_NAME),
  description: z.string().max(MAX_TEXT).optional(),
  /** 大きな括り（例: 睡眠・運動・困りごと）と、その中の小見出し */
  group: z.string().trim().max(MAX_NAME).optional(),
  section: z.string().trim().max(MAX_NAME).optional(),
  /** メモ欄の呼び名（例: 理由）と、常に表示するか（既定は「メモ」として折りたたみ） */
  noteLabel: z.string().trim().max(MAX_NAME).optional(),
  noteAlways: z.boolean().optional(),
  /** 「いきいきサイン」: この項目（自然にできていた度合い）と対になる「意識した」項目（試したこと）のID */
  pairedApproachId: z.string().min(1).max(64).optional(),
  order: z.number().int(),
  archivedAt: ts.optional(),
  createdAt: ts,
  updatedAt: ts,
});
export type Problem = z.infer<typeof ProblemSchema>;

export const ApproachSchema = z.object({
  id,
  name: z.string().trim().min(1).max(MAX_NAME),
  notes: z.string().max(MAX_TEXT).optional(),
  group: z.string().trim().max(MAX_NAME).optional(),
  section: z.string().trim().max(MAX_NAME).optional(),
  /** 「実施した」を選んだときに量を入力できる項目（例: お酒=杯の選択、運動=回数） */
  quantity: z
    .object({ unit: z.string().trim().min(1).max(10), mode: z.enum(['select', 'number']), max: z.number().int().min(1).max(1000).optional() })
    .optional(),
  linkedProblemIds: z.array(id),
  archivedAt: ts.optional(),
  createdAt: ts,
  updatedAt: ts,
});
export type Approach = z.infer<typeof ApproachSchema>;

export const ApproachStatusSchema = z.enum(['done', 'not_done', 'unknown']);
export type ApproachStatus = z.infer<typeof ApproachStatusSchema>;

/** null = 未入力（0とは別）。キーが無い場合も未入力 */
export const DailyEntrySchema = z.object({
  id,
  localDate,
  problemRatings: z.record(z.string(), problemRating.nullable()),
  problemNotes: z.record(z.string(), z.string().max(MAX_TEXT)),
  approachStatuses: z.record(z.string(), ApproachStatusSchema),
  /** 実施した項目の量（杯・回数など）。approachId → 数 */
  approachQuantities: z.record(z.string(), z.number().int().min(1).max(9999)).optional(),
  /** 合計睡眠時間（夜＋昼寝）。就寝・起床があれば自動計算した値を保存 */
  sleepHours: z.number().min(0).max(24).optional(),
  bedtime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  wakeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  napHours: z.number().min(0).max(24).optional(),
  /** 中途覚醒の回数。1〜2, 2〜3, 3〜4, 4〜5, 5〜6時間目の5区間。null=未入力 */
  awakenings: z.array(z.number().int().min(0).max(30).nullable()).length(5).optional(),
  /** ストレスは画面から外した（過去データの保持用） */
  stressRating: rating.optional(),
  /** メモ: 出来事 / 気づき / その他 */
  noteEvents: z.string().max(MAX_TEXT).optional(),
  noteInsights: z.string().max(MAX_TEXT).optional(),
  noteOther: z.string().max(MAX_TEXT).optional(),
  createdAt: ts,
  updatedAt: ts,
});
export type DailyEntry = z.infer<typeof DailyEntrySchema>;

export const AppSettingsSchema = z.object({
  schemaVersion: z.number().int(),
  onboardingCompleted: z.boolean(),
  lastBackupAt: ts.optional(),
  /** バックアップのお知らせを、この時刻まで出さない（「あとで」） */
  backupSnoozedUntil: ts.optional(),
  backupReminderDays: z.number().int().min(1).max(365),
  /** 画面のグループ（タブ）の並び順 */
  groupOrder: z.array(z.string().max(MAX_NAME)).optional(),
  characterId: z.string().optional(),
  characterName: z.string().max(MAX_NAME).optional(),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const SCHEMA_VERSION = 4;
export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SCHEMA_VERSION,
  onboardingCompleted: false,
  backupReminderDays: 14,
};
