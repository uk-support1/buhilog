import type { Group } from './groups';
import { UNGROUPED } from './groups';
import type { DailyEntry, Medication } from './types';

export interface GroupProgress { name: string; filled: number; total: number }

/** 1日の記録を、大分類ごとの「入力済み/全体」にまとめる（履歴の1行表示用）。今日の画面のタブ表示と同じ数え方。 */
export function groupProgress(entry: DailyEntry, groups: Group[], meds: Medication[] = []): GroupProgress[] {
  return groups.map((g) => {
    const ps = g.sections.flatMap((s) => s.problems);
    const as = g.sections.flatMap((s) => s.approaches);
    let filled = ps.filter((p) => entry.problemRatings[p.id] != null).length
      + as.filter((a) => (entry.approachStatuses[a.id] ?? 'unknown') !== 'unknown').length;
    let total = ps.length + as.length;
    // 服薬（困りごとに紐づく頓服は数えない）
    const gm = meds.filter((m) => !m.linkedProblemId && m.group === g.name);
    total += gm.length;
    filled += gm.filter((m) => entry.medIntake?.[m.id] !== undefined).length;
    if (g.name === '睡眠') {
      total += 3; // 就寝・起床・中途覚醒（昼寝は数えない）
      filled += (entry.bedtime ? 1 : 0) + (entry.wakeTime ? 1 : 0) + (entry.awakenings?.some((x) => x != null) ? 1 : 0);
    }
    return { name: g.name, filled, total };
  }).filter((p) => p.total > 0);
}

/** 表示用の短い名前（「前夜要因」→「前夜」）。未設定グループは「記録」 */
export function shortGroupName(name: string): string {
  return name === UNGROUPED ? '記録' : name.replace(/要因$/, '');
}
