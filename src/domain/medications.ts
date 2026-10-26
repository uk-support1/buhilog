import type { DailyEntry, Medication, Problem } from './types';

/**
 * 服薬の記録（記録のみ。分析・提案には使わない）。
 * 薬の効果・副作用の判定、増減や中止の提案は行わない（仕様書の方針）。
 */
export const DOSE_OPTIONS = [0, 12.5, 25, 37.5, 50] as const;
export const DOSE_UNIT = 'mg';

/** トラゾドンは、25mg錠を 1/4・1/3・1と1/4・1と1/3 に分けて飲むことがあるため、その量も選べる（mgに直して小数2桁） */
const EXTRA_DOSES: Record<string, number[]> = { トラゾドン: [6.25, 8.33, 31.25, 33.33] };
const DOSE_NOTE: Record<string, string> = { '6.25': '1/4錠', '8.33': '1/3錠', '31.25': '1と1/4錠', '33.33': '1と1/3錠' };
export const doseOptionsFor = (name: string): number[] =>
  [...DOSE_OPTIONS, ...(EXTRA_DOSES[name] ?? [])].sort((a, b) => a - b);
export const doseNote = (name: string, v: string): string => (name in EXTRA_DOSES ? DOSE_NOTE[v] ?? '' : '');

interface Def {
  name: string;
  kind: 'dose' | 'taken';
  baseDose?: number;
  group: string;
  section?: string;
  /** 紐づける困りごとの名前（あれば、その困りごとの欄に出る） */
  problemName?: string;
}
const DEFS: Def[] = [
  { name: 'クービビック', kind: 'dose', baseDose: 50, group: '前夜要因', section: '服薬' },
  { name: 'セルトラリン', kind: 'dose', baseDose: 50, group: '前夜要因', section: '服薬' },
  { name: 'トラゾドン', kind: 'dose', baseDose: 25, group: '前夜要因', section: '服薬' },
  { name: 'コンサータ', kind: 'taken', group: '朝要因', section: '服薬' },
  { name: 'アセトアミノフェン', kind: 'taken', group: '困りごと', problemName: '頭痛' },
  { name: 'ロキソニン', kind: 'taken', group: '困りごと', problemName: '頭痛' },
];

const num = (s: string) => Number(s);

/**
 * 旧い記録の引き継ぎ: 以前は「【服薬】前日: セルトラリン37.5／クービビック25 ・当日朝: コンサータ7:00」という
 * メモの文字で残していた。読み取れたものだけを、新しい服薬の記録に移し、メモからは取り除く（読み取れなかった分は文字のまま残す）。
 */
function migrateMedText(note: string | undefined, byName: Map<string, Medication>): { intake: Record<string, number>; note: string | undefined } {
  const intake: Record<string, number> = {};
  if (!note) return { intake, note };
  const lines: string[] = [];
  for (const line of note.split('\n')) {
    const m = /^【服薬】(.*)$/.exec(line);
    // 想定の形（前日: … ・当日朝: …）でなければ、そのまま残す（読み取れない文字は、決して消さない）
    const body = m ? /^\s*(?:前日:\s*(.*?))?(?:\s*・?\s*当日朝:\s*(.*))?$/.exec(m[1]) : null;
    if (!m || !body) { lines.push(line); continue; }
    const lineIntake: Record<string, number> = {};
    const keepPrev: string[] = [];
    for (const item of body[1] ? body[1].split('／') : []) {
      const d = /^(クービビック|セルトラリン|トラゾドン)(\d+(?:\.\d+)?)$/.exec(item);
      const med = d ? byName.get(d[1]) : undefined;
      if (d && med) lineIntake[med.id] = num(d[2]); else keepPrev.push(item);
    }
    const keepMorning: string[] = [];
    for (const item of body[2] ? body[2].split('／') : []) {
      const c = /^コンサータ\d{1,2}:\d{2}$/.test(item) ? byName.get('コンサータ') : undefined;
      if (c) lineIntake[c.id] = 1; else keepMorning.push(item);
    }
    if (Object.keys(lineIntake).length === 0) { lines.push(line); continue; } // 読み取れたものがなければ、元の行のまま
    Object.assign(intake, lineIntake);
    const parts = [
      keepPrev.length ? `前日: ${keepPrev.join('／')}` : '',
      keepMorning.length ? `当日朝: ${keepMorning.join('／')}` : '',
    ].filter(Boolean);
    if (parts.length) lines.push(`【服薬】${parts.join(' ・')}`);
  }
  return { intake, note: lines.length ? lines.join('\n') : undefined };
}

/** 服薬の項目を整える（何度実行しても同じ結果）。既存の記録は、読み取れた服薬の文字だけを移す。 */
export function ensureMedications(
  problems: Problem[], medications: Medication[], entries: DailyEntry[], newId: () => string, now: number,
): { medications: Medication[]; entries: DailyEntry[]; changed: boolean } {
  let changed = false;
  const meds = medications.map((m) => ({ ...m }));
  for (const d of DEFS) {
    if (meds.some((m) => m.name === d.name)) continue;
    const linked = d.problemName ? problems.find((p) => p.name === d.problemName) : undefined;
    if (d.problemName && !linked) continue; // 紐づける困りごと（頭痛）がなければ作らない
    const m: Medication = {
      id: newId(), name: d.name, kind: d.kind, group: d.group, order: meds.reduce((x, y) => Math.max(x, y.order), -1) + 1,
      createdAt: now, updatedAt: now, ...(d.kind === 'dose' ? { unit: 'mg', baseDose: d.baseDose } : {}),
      ...(d.section ? { section: d.section } : {}), ...(linked ? { linkedProblemId: linked.id } : {}),
    };
    meds.push(m);
    changed = true;
  }
  const byName = new Map(meds.map((m) => [m.name, m]));
  const es = entries.map((e) => {
    const { intake, note } = migrateMedText(e.noteOther, byName);
    const ids = Object.keys(intake).filter((id) => e.medIntake?.[id] === undefined); // 入力済みの値は上書きしない
    if (note === e.noteOther && ids.length === 0) return e;
    changed = true;
    const next: DailyEntry = { ...e };
    if (ids.length) next.medIntake = { ...e.medIntake, ...Object.fromEntries(ids.map((id) => [id, intake[id]])) };
    if (note) next.noteOther = note; else delete next.noteOther;
    return next;
  });
  return { medications: meds, entries: es, changed };
}

/** 服薬の項目を、記録の1行表示用（進捗）に数える */
export function medProgress(entry: Pick<DailyEntry, 'medIntake'>, meds: Medication[]): { filled: number; total: number } {
  return { filled: meds.filter((m) => entry.medIntake?.[m.id] !== undefined).length, total: meds.length };
}
