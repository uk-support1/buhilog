/**
 * ぶひお（公式素材）。画像は public/buhio/ にある。出典は docs/ASSETS.md を参照。
 * 画像は装飾なので、読み上げ対象にしない（alt は空）。
 */
export type Pose = 'standing' | 'waving' | 'pointing' | 'jumping' | 'surprised' | 'important';

export const POSES: { pose: Pose; label: string; use: string }[] = [
  { pose: 'standing', label: '立ちポーズ', use: '通常' },
  { pose: 'waving', label: 'あいさつ', use: 'はじめの画面' },
  { pose: 'pointing', label: '指さし', use: '案内' },
  { pose: 'jumping', label: 'やったね', use: '保存できたとき' },
  { pose: 'surprised', label: 'びっくり', use: '（予備）' },
  { pose: 'important', label: 'ここ重要', use: '注意書き' },
];

export function Buhio({ size = 56, pose = 'standing' }: { size?: number; pose?: Pose }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}buhio/${pose}.webp`}
      alt=""
      aria-hidden="true"
      height={size}
      style={{ height: size, width: 'auto' }}
      className="buhio"
      data-pose={pose}
      draggable={false}
    />
  );
}
