import type { BoostAction } from './types';

/**
 * 「上げる方法」の一覧。画面（朝の調子が低いときの選択）は取りやめたが、すでに記録した内容（記録の boost）の
 * 読み出し（CSVの書き出し）のために、一覧の名前を引く部分だけ残している。
 */
export const BOOST_NONE = 'none';

export const DEFAULT_BOOST_ACTIONS: BoostAction[] = [
  { id: 'shower', name: 'シャワーを浴びる' },
  { id: 'bz', name: "B'zの動画をみる" },
  { id: 'univ', name: '大学の時の動画をみる' },
  { id: BOOST_NONE, name: '何もしなかった' },
];

/** 一覧（「何もしなかった」はいつも最後に1つだけ） */
export function boostActionsOf(saved?: BoostAction[]): BoostAction[] {
  const base = (saved ?? DEFAULT_BOOST_ACTIONS).filter((a) => a.id !== BOOST_NONE);
  const none = (saved ?? DEFAULT_BOOST_ACTIONS).find((a) => a.id === BOOST_NONE) ?? DEFAULT_BOOST_ACTIONS[DEFAULT_BOOST_ACTIONS.length - 1];
  return [...base, none];
}
