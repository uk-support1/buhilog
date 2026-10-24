import type { Approach, Problem } from './types';

export const UNGROUPED = 'その他';

/** 未回答をまとめて「実施しなかった」にできるグループ。「しなかった」が良し悪しの意味を持たない（中立な）グループに限る */
export const BULK_NOT_DONE_GROUPS: string[] = ['運動要因'];

export interface Section {
  title: string | null;
  problems: Problem[];
  approaches: Approach[];
}
export interface Group {
  name: string;
  sections: Section[];
}

/** グループ（大きな括り）→小見出し→項目 の順に整理する。並びは groupOrder → 初出順。未設定は「その他」を最後に。 */
export function buildGroups(problems: Problem[], approaches: Approach[], groupOrder: string[] = []): Group[] {
  const gname = (x: { group?: string }) => x.group?.trim() || UNGROUPED;
  const sname = (x: { section?: string }) => x.section?.trim() || null;
  const seen: string[] = [];
  for (const x of [...problems, ...approaches]) if (!seen.includes(gname(x))) seen.push(gname(x));
  const ordered = [
    ...groupOrder.filter((g) => seen.includes(g)),
    ...seen.filter((g) => !groupOrder.includes(g) && g !== UNGROUPED),
    ...seen.filter((g) => g === UNGROUPED),
  ];
  return ordered.map((name) => {
    const sections: Section[] = [];
    const get = (title: string | null) => {
      let s = sections.find((x) => x.title === title);
      if (!s) { s = { title, problems: [], approaches: [] }; sections.push(s); }
      return s;
    };
    for (const p of problems) if (gname(p) === name) get(sname(p)).problems.push(p);
    for (const a of approaches) if (gname(a) === name) get(sname(a)).approaches.push(a);
    return { name, sections };
  });
}

export const hasNamedGroups = (groups: Group[]) => groups.some((g) => g.name !== UNGROUPED);
