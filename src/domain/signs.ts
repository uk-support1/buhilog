import type { Approach, Problem } from './types';

/**
 * 「いきいきサイン」: 背筋の伸び・口角のように、
 *   ・生き生きしている「結果」として自然に出る（状態: 1〜5の点数）と同時に、
 *   ・意識して整えると気分が上がる「きっかけ」にもなる（行動: 意識した/しなかった）
 * という2つの面をもつ項目。原因と結果が混ざらないよう、2つの面を別々に記録する。
 */
export const SIGN_GROUP = 'いきいきサイン';
export const SIGN_INTRO =
  '生き生きしているときに自然に出る「合図」であり、意識して整えると気分が上がる「きっかけ」にもなる項目です。「意識したか」と「自然にできていた度合い」を、分けて記録します。';

export const STATE_HINT = { upright: '5＝自然に伸びていた 〜 1＝丸まっていた', smile: '5＝自然に上がっていた 〜 1＝下がっていた' } as const;
const DEFS = [
  { name: '背筋の伸び', practice: '背筋を意識した', description: STATE_HINT.upright },
  { name: '口角', practice: '口角を意識した', description: STATE_HINT.smile },
] as const;

export const isSign = (p: Problem): boolean => !!p.pairedApproachId;

/** 「意識した」項目が、サインの一部として画面に出る（試したことの一覧には出さない）ID集合 */
export const pairedApproachIds = (problems: Problem[]): Set<string> =>
  new Set(problems.flatMap((p) => (p.pairedApproachId ? [p.pairedApproachId] : [])));

interface Ids { (): string }

/**
 * 背筋の伸び・口角を「いきいきサイン」として整える（何度実行しても同じ結果）。
 * - 既存の項目があればグループを移し、なければ作る。「意識した」項目を対にして結びつける。
 * - 並び順（グループ）は「日中要因」の次・「困りごと」の前。
 */
export function ensureVitalitySigns(
  problems: Problem[], approaches: Approach[], groupOrder: string[] | undefined, newId: Ids, now: number,
): { problems: Problem[]; approaches: Approach[]; groupOrder: string[] | undefined; changed: boolean } {
  let changed = false;
  const ps = problems.map((p) => ({ ...p }));
  const as = approaches.map((a) => ({ ...a }));
  for (const d of DEFS) {
    let p = ps.find((x) => x.name === d.name);
    if (!p) {
      p = { id: newId(), name: d.name, description: d.description, group: SIGN_GROUP, order: ps.reduce((m, x) => Math.max(m, x.order), -1) + 1, createdAt: now, updatedAt: now };
      ps.push(p); changed = true;
    } else if (p.group !== SIGN_GROUP || p.section || !p.description) {
      p.group = SIGN_GROUP; delete p.section; p.description = p.description || d.description; p.updatedAt = now; changed = true;
    }
    let a = as.find((x) => x.id === p!.pairedApproachId) ?? as.find((x) => x.name === d.practice);
    if (!a) {
      a = { id: newId(), name: d.practice, linkedProblemIds: [p.id], group: SIGN_GROUP, createdAt: now, updatedAt: now };
      as.push(a); changed = true;
    } else if (a.group !== SIGN_GROUP) { a.group = SIGN_GROUP; a.updatedAt = now; changed = true; }
    if (p.pairedApproachId !== a.id) { p.pairedApproachId = a.id; p.updatedAt = now; changed = true; }
  }
  let order = groupOrder;
  if (order && !order.includes(SIGN_GROUP)) {
    const i = order.indexOf('困りごと');
    order = i >= 0 ? [...order.slice(0, i), SIGN_GROUP, ...order.slice(i)] : [...order, SIGN_GROUP];
    changed = true;
  }
  return { problems: ps, approaches: as, groupOrder: order, changed };
}
