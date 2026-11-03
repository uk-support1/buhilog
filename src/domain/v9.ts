import type { Approach, DailyEntry, Problem } from './types';

/**
 * v9 の整え（何度実行しても同じ結果。項目の削除はしない）:
 *  - 「いきいきサイン」→「生き生き」（グループ名）
 *  - ボタンの名前: スマホ→「スマホを見なかった／見た」、お酒→「飲んだ／飲んでない」
 *  - 運動要因は「筋肉痛」も選べる。「足・肩」は「足」と「肩」に分ける（過去の記録は両方に同じ内容を写す）。
 *    「その他筋トレ」は、回数をやめて「実施した」＋どんな筋トレかのメモ欄に
 *  - マルチタスク: 「マルチタスクをやらない」(5＝良い) → 「マルチタスク」(1＝やらなかった 〜 5＝やってしまった)。過去の点数は 6−点数 に反転
 */
export const OLD_SIGN_GROUP = 'いきいきサイン';
const MULTI_OLD = 'マルチタスクをやらない';
const MULTI_DESC = '1＝やらなかった 〜 5＝やってしまった（多いほど良くない）';
const SORE_NOTE = 'どんな筋トレをしたか（メモ）';

export interface V9Data { problems: Problem[]; approaches: Approach[]; entries: DailyEntry[]; groupOrder?: string[] }

export function applyV9(d: V9Data, newId: () => string, now: number): V9Data & { changed: boolean } {
  let changed = false;
  const touch = <T extends { updatedAt: number }>(x: T, patch: Partial<T>) => { Object.assign(x, patch, { updatedAt: now }); changed = true; };
  const problems = d.problems.map((p) => ({ ...p }));
  let approaches = d.approaches.map((a) => ({ ...a }));
  let entries = d.entries;
  let groupOrder = d.groupOrder;

  // グループ名
  for (const p of problems) if (p.group === OLD_SIGN_GROUP) touch(p, { group: '生き生き' });
  for (const a of approaches) if (a.group === OLD_SIGN_GROUP) touch(a, { group: '生き生き' });
  if (groupOrder?.includes(OLD_SIGN_GROUP)) { groupOrder = groupOrder.map((g) => (g === OLD_SIGN_GROUP ? '生き生き' : g)); changed = true; }

  // ボタンの名前
  for (const a of approaches) {
    if (/スマホ/.test(a.name) && !a.doneLabel) touch(a, { doneLabel: 'スマホを見なかった', notDoneLabel: 'スマホを見た' });
    else if (/お酒/.test(a.name) && !a.doneLabel) touch(a, { doneLabel: '飲んだ', notDoneLabel: '飲んでない' });
  }

  // 運動要因: 筋肉痛・足と肩の分割・その他筋トレのメモ
  const legShoulder = approaches.find((a) => a.name === '足・肩' && !a.archivedAt);
  if (legShoulder && !approaches.some((a) => a.name === '足' && a.group === legShoulder.group)) {
    const shoulder: Approach = { ...legShoulder, id: newId(), name: '肩', createdAt: legShoulder.createdAt + 1, updatedAt: now };
    touch(legShoulder, { name: '足' });
    // 並びは作成順なので、「肩」が「足」の直後に来るよう、それより後に作った項目を1つずらす
    for (const a of approaches) if (a.createdAt > legShoulder.createdAt) a.createdAt += 1;
    approaches.push(shoulder);
    entries = entries.map((e) => {
      const s = e.approachStatuses?.[legShoulder.id];
      if (s === undefined) return e;
      const q = e.approachQuantities?.[legShoulder.id];
      return {
        ...e,
        approachStatuses: { ...e.approachStatuses, [shoulder.id]: s },
        ...(q != null ? { approachQuantities: { ...e.approachQuantities, [shoulder.id]: q } } : {}),
      };
    });
  }
  for (const a of approaches) {
    if (a.group === '運動要因' && !a.archivedAt && !a.sore) touch(a, { sore: true });
    if (a.name === 'その他筋トレ' && !a.noteLabel) {
      delete a.quantity; // 回数の入力はやめる（過去の回数の記録は残る）
      touch(a, { noteLabel: SORE_NOTE });
    }
  }

  // マルチタスク（向きを逆に）
  const multi = problems.find((p) => p.name === MULTI_OLD && !p.reverse);
  if (multi) {
    touch(multi, { name: 'マルチタスク', description: MULTI_DESC, reverse: true });
    entries = entries.map((e) => {
      const r = e.problemRatings?.[multi.id];
      return r == null ? e : { ...e, problemRatings: { ...e.problemRatings, [multi.id]: 6 - r } };
    });
  }
  return { problems, approaches, entries, groupOrder, changed };
}
