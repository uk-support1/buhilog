import type { Problem } from './types';

/**
 * 睡眠の「朝の耳鳴り」（5段階。5＝ない、4＝少しある、1＝強い）。「睡眠の質」のすぐ下に足す（何度実行しても同じ結果）。
 * 「睡眠の質」がなければ、睡眠グループの最後に足す。
 */
export const MORNING_TINNITUS = { name: '朝の耳鳴り', description: '5＝ない 〜 4＝少しある 〜 1＝強い' } as const;

export function ensureMorningTinnitus(problems: Problem[], newId: () => string, now: number): { problems: Problem[]; changed: boolean } {
  if (problems.some((p) => p.name === MORNING_TINNITUS.name)) return { problems, changed: false };
  const quality = problems.find((p) => p.name === '睡眠の質' && !p.archivedAt) ?? problems.find((p) => p.name === '睡眠の質');
  const ps = problems.map((p) => ({ ...p }));
  const order = quality ? quality.order + 1 : ps.reduce((m, p) => Math.max(m, p.order), -1) + 1;
  // 「睡眠の質」の直後に入れるため、それより後の項目の順番を1つずつ後ろへ
  if (quality) for (const p of ps) if (p.order >= order) { p.order += 1; p.updatedAt = now; }
  ps.push({
    id: newId(), name: MORNING_TINNITUS.name, description: MORNING_TINNITUS.description,
    group: quality?.group ?? '睡眠', ...(quality?.section ? { section: quality.section } : {}),
    order, createdAt: now, updatedAt: now,
  });
  return { problems: ps, changed: true };
}
