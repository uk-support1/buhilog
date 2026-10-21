import { z } from 'zod';
import { isValidLocalDate } from './date';

export const MAX_NAME = 50;
export const MAX_TEXT = 2000;

const id = z.string().min(1).max(64);
const ts = z.number().int().nonnegative();
const rating = z.number().int().min(0).max(10);
const localDate = z.string().refine(isValidLocalDate, '日付の形式が正しくありません');

export const ProblemSchema = z.object({
  id,
  name: z.string().trim().min(1).max(MAX_NAME),
  description: z.string().max(MAX_TEXT).optional(),
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
  problemRatings: z.record(z.string(), rating.nullable()),
  problemNotes: z.record(z.string(), z.string().max(MAX_TEXT)),
  approachStatuses: z.record(z.string(), ApproachStatusSchema),
  sleepHours: z.number().min(0).max(24).optional(),
  stressRating: rating.optional(),
  note: z.string().max(MAX_TEXT).optional(),
  createdAt: ts,
  updatedAt: ts,
});
export type DailyEntry = z.infer<typeof DailyEntrySchema>;

export const AppSettingsSchema = z.object({
  schemaVersion: z.number().int(),
  onboardingCompleted: z.boolean(),
  lastBackupAt: ts.optional(),
  backupReminderDays: z.number().int().min(1).max(365),
  characterId: z.string().optional(),
  characterName: z.string().max(MAX_NAME).optional(),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const SCHEMA_VERSION = 1;
export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SCHEMA_VERSION,
  onboardingCompleted: false,
  backupReminderDays: 14,
};
