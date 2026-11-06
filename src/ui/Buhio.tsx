/**
 * ぶひお（公式素材）。画像は public/buhio/ にある。出典は docs/ASSETS.md を参照。
 * 画像は装飾なので、読み上げ対象にしない（alt は空）。
 *
 * animate を付けると、動きのあるポーズ（MOTIONS）は public/buhio/motion/ のコマ並べ画像で
 * 決まった回数だけ動いて止まる。端末の「視覚効果を減らす」設定がオンのとき、
 * または動きの無いポーズのときは、従来どおり静止画を表示する。
 */
import type { CSSProperties } from 'react';

export type Pose = 'standing' | 'waving' | 'pointing' | 'jumping' | 'surprised' | 'important';

export const POSES: { pose: Pose; label: string; use: string }[] = [
  { pose: 'standing', label: '立ちポーズ', use: '通常' },
  { pose: 'waving', label: 'あいさつ', use: 'はじめの画面' },
  { pose: 'pointing', label: '指さし', use: '案内' },
  { pose: 'jumping', label: 'やったね', use: '保存できたとき' },
  { pose: 'surprised', label: 'びっくり', use: '（予備）' },
  { pose: 'important', label: 'ここ重要', use: '注意書き' },
];

/**
 * 動きのあるポーズ。frames=コマ数、w/h=1コマのpx（画像は横にコマを並べた幅 frames*w）、
 * frameMs=1コマの表示時間、plays=くり返し回数。CSS の @keyframes buhio-<pose> とコマ数を合わせること。
 * 動かすのは「保存できた」「はじめの画面」の2か所だけ（記録の邪魔をしないため）。
 */
export const MOTIONS: Partial<Record<Pose, { frames: number; w: number; h: number; frameMs: number; plays: number }>> = {
  jumping: { frames: 5, w: 153, h: 178, frameMs: 120, plays: 1 },
  waving: { frames: 4, w: 141, h: 178, frameMs: 220, plays: 2 },
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Buhio({ size = 56, pose = 'standing', animate = false }: { size?: number; pose?: Pose; animate?: boolean }) {
  const motion = MOTIONS[pose];
  if (animate && motion && !prefersReducedMotion()) {
    const style = {
      height: size,
      width: Math.round((size * motion.w) / motion.h),
      backgroundImage: `url(${import.meta.env.BASE_URL}buhio/motion/${pose}.webp)`,
      backgroundSize: `${motion.frames * 100}% 100%`,
      animationName: `buhio-${pose}`,
      animationDuration: `${motion.frameMs * motion.frames}ms`,
      animationIterationCount: motion.plays,
    } as CSSProperties;
    return <span aria-hidden="true" className="buhio buhio-motion" data-pose={pose} data-motion={pose} style={style} />;
  }
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
