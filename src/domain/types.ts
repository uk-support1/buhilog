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
  /** この項目の点数は、ほかの困りごとの「要因」としても比べる（例: 日中の過ごし方を5段階で記録する項目） */
  asFactor: z.boolean().optional(),
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
  /** 服薬の記録。medicationId → 量(mg)、または 飲んだ=1／飲まなかった=0。未入力はキーなし */
  medIntake: z.record(z.string(), z.number().min(0).max(1000)).optional(),
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

/**
 * 服薬の項目（記録のみ。分析・提案には使わない）。
 *  - kind 'dose': 量（mg）を選ぶ（0＝飲まなかった）。baseDose は「すべて飲んだ」で入る基本量。
 *  - kind 'taken': 飲んだ（1）／飲まなかった（0）。linkedProblemId があれば、その困りごとの欄に表示（例: 頭痛の頓服）。
 */
export const MedicationSchema = z.object({
  id,
  name: z.string().trim().min(1).max(MAX_NAME),
  kind: z.enum(['dose', 'taken']),
  unit: z.string().max(10).optional(),
  baseDose: z.number().min(0).max(1000).optional(),
  group: z.string().trim().max(MAX_NAME).optional(),
  section: z.string().trim().max(MAX_NAME).optional(),
  linkedProblemId: z.string().min(1).max(64).optional(),
  order: z.number().int(),
  archivedAt: ts.optional(),
  createdAt: ts,
  updatedAt: ts,
});
export type Medication = z.infer<typeof MedicationSchema>;

/** 予定（カレンダー）。繰り返しは、設定から日ごとの予定を計算して表示する（1件の予定として保存）。 */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const EVENT_COLORS = ['brown', 'blue', 'pink', 'red', 'yellow', 'green', 'purple', 'gray'] as const;
export const RepeatSchema = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(99),
  /** 曜日（0=日〜6=土）。毎週のときだけ使う。空なら、開始日の曜日 */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  until: localDate.optional(),
  count: z.number().int().min(1).max(999).optional(),
});
export const EventSchema = z
  .object({
    id,
    title: z.string().trim().min(1).max(100),
    date: localDate,
    endDate: localDate.optional(),
    allDay: z.boolean(),
    startTime: hhmm.optional(),
    endTime: hhmm.optional(),
    place: z.string().max(100).optional(),
    memo: z.string().max(MAX_TEXT).optional(),
    /** 表示の色（なければ茶） */
    color: z.enum(EVENT_COLORS).optional(),
    repeat: RepeatSchema.optional(),
    /** 繰り返しの予定のうち、除く日（その日だけ削除したとき） */
    exdates: z.array(localDate).max(1000).optional(),
    /** カレンダーファイルから読み込んだ予定の元のID（再読み込みで重複させない） */
    uid: z.string().max(300).optional(),
    source: z.enum(['manual', 'ics']).optional(),
    createdAt: ts,
    updatedAt: ts,
  })
  .refine((e) => !e.endDate || e.endDate >= e.date, { message: '終了日は開始日以降にしてください', path: ['endDate'] })
  .refine((e) => e.allDay || !e.startTime || !e.endTime || !!e.endDate || e.endTime > e.startTime, { message: '終了時刻は開始時刻より後にしてください', path: ['endTime'] });
export type CalendarEvent = z.infer<typeof EventSchema>;
export type Repeat = z.infer<typeof RepeatSchema>;

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

export const SCHEMA_VERSION = 7;
export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SCHEMA_VERSION,
  onboardingCompleted: false,
  backupReminderDays: 14,
};
