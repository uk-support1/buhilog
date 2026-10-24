import type { Approach, DailyEntry, Problem } from './types';

/**
 * 日中要因の3項目（マルチタスクをやらない・コミュニケーション量・誰かの役に立つ）を、
 * 「実施した/しなかった」から「5段階評価（5が良い）」へ。コミュニケーションと誰かの役に立つは、メモ欄を常に表示する。
 * 5段階は困りごとと同じ向き（5＝いちばん良い）。ほかの困りごとの「要因」としても比べる（asFactor）。
 */
const DEFS = [
  { name: 'マルチタスクをやらない', description: '5＝1つずつ集中できた 〜 1＝同時進行でバタバタ', memo: false },
  { name: 'コミュニケーション量', description: '5＝たっぷり交流できた 〜 1＝ほとんどなかった', memo: true },
  { name: '誰かの役に立つ', description: '5＝しっかり役に立てた 〜 1＝まったくなかった', memo: true },
] as const;

export const DAY_FACTOR_NAMES: string[] = DEFS.map((d) => d.name);
const MEMO_LABEL = 'メモ（あれば）';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 旧い記録の引き継ぎ（何度実行しても同じ結果。項目の削除はしない）:
 *  - 旧「試したこと」の実施 → 4、しなかった → 1、△（メモに残っていたもの）→ 2。未回答は未入力のまま。
 *  - 旧項目はアーカイブ（過去の記録は新しい項目に移すので、旧項目の実施状況は取り除く）。
 *  - その他のメモに「【項目名】…」として残っていた文字は、新しい項目のメモ（または理由欄）に移す。
 */
export function convertDayFactors(
  problems: Problem[], approaches: Approach[], entries: DailyEntry[], newId: () => string, now: number,
): { problems: Problem[]; approaches: Approach[]; entries: DailyEntry[]; changed: boolean } {
  let changed = false;
  const ps = problems.map((p) => ({ ...p }));
  const as = approaches.map((a) => ({ ...a }));
  let es = entries;
  for (const d of DEFS) {
    const a = as.find((x) => x.name === d.name);
    if (!a || ps.some((p) => p.name === d.name)) continue; // 旧項目がない、またはすでに移行済み
    const p: Problem = {
      id: newId(), name: d.name, description: d.description, group: a.group || '日中要因', asFactor: true,
      ...(d.memo ? { noteLabel: MEMO_LABEL, noteAlways: true } : {}),
      order: ps.reduce((m, x) => Math.max(m, x.order), -1) + 1, createdAt: now, updatedAt: now,
    };
    ps.push(p);
    a.archivedAt = a.archivedAt ?? now;
    a.updatedAt = now;
    changed = true;
    const line = new RegExp(`^【${escape(d.name)}】(.*)$`);
    es = es.map((e) => {
      const st = e.approachStatuses?.[a.id];
      let noteOther = e.noteOther;
      let triangle = false;
      const memos: string[] = [];
      if (noteOther) {
        const keep: string[] = [];
        for (const l of noteOther.split('\n')) {
          const m = line.exec(l);
          if (!m) { keep.push(l); continue; }
          const t = m[1].trim();
          if (t.startsWith('△')) triangle = true;
          const rest = t.replace(/^[△〇○◯◎×✕✖]+/, '').trim();
          if (rest) memos.push(rest);
        }
        noteOther = keep.length ? keep.join('\n') : undefined;
      }
      if (st === undefined && !triangle && memos.length === 0) return e;
      const rating = st === 'done' ? 4 : st === 'not_done' ? 1 : triangle ? 2 : undefined;
      const statuses = { ...e.approachStatuses };
      delete statuses[a.id];
      const next: DailyEntry = { ...e, approachStatuses: statuses, problemRatings: { ...e.problemRatings }, problemNotes: { ...e.problemNotes } };
      if (rating !== undefined) next.problemRatings[p.id] = rating;
      if (memos.length) next.problemNotes[p.id] = memos.join('／');
      if (noteOther) next.noteOther = noteOther; else delete next.noteOther;
      if (next.approachQuantities) { const q = { ...next.approachQuantities }; delete q[a.id]; next.approachQuantities = Object.keys(q).length ? q : undefined; }
      return next;
    });
  }
  return { problems: ps, approaches: as, entries: es, changed };
}
