/**
 * 仮キャラクター「ぶひお」（オリジナルのSVG）。
 * 正式な素材が提供されたら、このファイルの中身を差し替えるだけで全画面に反映される。
 */
export type Pose = 'front' | 'smile' | 'wave' | 'cheer' | 'think' | 'rest' | 'back';

export const POSES: { pose: Pose; label: string }[] = [
  { pose: 'front', label: '正面' },
  { pose: 'smile', label: 'にっこり' },
  { pose: 'wave', label: '手をふる' },
  { pose: 'cheer', label: 'やったね' },
  { pose: 'think', label: 'かんがえ中' },
  { pose: 'rest', label: 'ひと休み' },
  { pose: 'back', label: 'うしろ姿' },
];

const SKIN = '#ffc4d2';
const DARK = '#ff9db5';
const INK = '#4a3340';
const GOLD = '#ffcf4a';
const SHIRT = '#8fd0f2';
const SHIRT_DARK = '#5db6e6';

const Star = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z" fill={GOLD} />
);

function Ears() {
  return (
    <g>
      <ellipse cx="33" cy="34" rx="10" ry="14" transform="rotate(-28 33 34)" fill={SKIN} />
      <ellipse cx="33" cy="35" rx="5" ry="8" transform="rotate(-28 33 35)" fill={DARK} />
      <ellipse cx="87" cy="34" rx="10" ry="14" transform="rotate(28 87 34)" fill={SKIN} />
      <ellipse cx="87" cy="35" rx="5" ry="8" transform="rotate(28 87 35)" fill={DARK} />
    </g>
  );
}

function Arms({ pose }: { pose: Pose }) {
  const arm = (cx: number, cy: number, rot: number) => (
    <ellipse cx={cx} cy={cy} rx="6.5" ry="13" transform={`rotate(${rot} ${cx} ${cy})`} fill={SHIRT} />
  );
  if (pose === 'cheer') return <g>{arm(29, 82, -38)}{arm(91, 82, 38)}</g>;
  if (pose === 'wave') return <g>{arm(32, 100, 14)}{arm(90, 80, 38)}</g>;
  if (pose === 'think') return <g>{arm(32, 100, 14)}{arm(72, 88, -28)}</g>;
  return <g>{arm(33, 100, 14)}{arm(87, 100, -14)}</g>;
}

function Eyes({ pose }: { pose: Pose }) {
  if (pose === 'smile' || pose === 'cheer' || pose === 'wave')
    return (
      <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
        <path d="M41 56 Q47 48 53 56" /><path d="M67 56 Q73 48 79 56" />
      </g>
    );
  if (pose === 'rest')
    return (
      <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
        <path d="M41 53 Q47 59 53 53" /><path d="M67 53 Q73 59 79 53" />
      </g>
    );
  const dx = pose === 'think' ? 2 : 0;
  const dy = pose === 'think' ? -2 : 0;
  return (
    <g>
      <circle cx={47 + dx} cy={54 + dy} r="4.2" fill={INK} /><circle cx={73 + dx} cy={54 + dy} r="4.2" fill={INK} />
      <circle cx={48.4 + dx} cy={52.6 + dy} r="1.4" fill="#fff" /><circle cx={74.4 + dx} cy={52.6 + dy} r="1.4" fill="#fff" />
    </g>
  );
}

function Mouth({ pose }: { pose: Pose }) {
  if (pose === 'smile' || pose === 'cheer' || pose === 'wave')
    return (
      <g>
        <path d="M51 76 Q60 92 69 76 Z" fill="#c4566e" />
        <path d="M55 83 Q60 88 65 83 Q60 80 55 83 Z" fill="#ff8fa6" />
      </g>
    );
  if (pose === 'think') return <path d="M56 79 L64 79" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />;
  return <path d="M54 77 Q60 82 66 77" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />;
}

function Front({ pose }: { pose: Pose }) {
  return (
    <g>
      <Ears />
      <ellipse cx="60" cy="101" rx="24" ry="18" fill={SHIRT} />
      <path d="M48 86 Q60 94 72 86" fill="none" stroke={SHIRT_DARK} strokeWidth="2.5" strokeLinecap="round" />
      <text x="60" y="108" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" stroke={SHIRT_DARK} strokeWidth=".6">39</text>
      <ellipse cx="47" cy="116" rx="9" ry="4" fill={DARK} /><ellipse cx="73" cy="116" rx="9" ry="4" fill={DARK} />
      <Arms pose={pose} />
      <ellipse cx="60" cy="58" rx="35" ry="31" fill={SKIN} />
      <circle cx="37" cy="66" r="6" fill="#ff8aa5" opacity=".55" /><circle cx="83" cy="66" r="6" fill="#ff8aa5" opacity=".55" />
      <Eyes pose={pose} />
      <ellipse cx="60" cy="67" rx="13" ry="9" fill={DARK} />
      <circle cx="55" cy="67" r="2" fill="#c4566e" /><circle cx="65" cy="67" r="2" fill="#c4566e" />
      <Mouth pose={pose} />
      {pose === 'cheer' && (<g><Star x={14} y={36} s={1.3} /><Star x={106} y={30} s={1.1} /><Star x={104} y={60} s={0.8} /></g>)}
      {pose === 'wave' && (<g fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round"><path d="M104 56 Q110 62 104 68" /><path d="M110 52 Q118 62 110 72" /></g>)}
      {pose === 'rest' && (<g fill="#7aa7e6" fontWeight="700" fontSize="13"><text x="92" y="30">z</text><text x="102" y="18" fontSize="10">z</text></g>)}
      {pose === 'think' && (
        <g>
          <circle cx="94" cy="34" r="3" fill="#cfe3ff" /><circle cx="100" cy="26" r="4" fill="#cfe3ff" />
          <ellipse cx="108" cy="14" rx="10" ry="9" fill="#cfe3ff" />
          <text x="108" y="19" textAnchor="middle" fontSize="13" fontWeight="700" fill="#4b78c9">?</text>
        </g>
      )}
    </g>
  );
}

function Back() {
  return (
    <g>
      <Ears />
      <ellipse cx="60" cy="96" rx="29" ry="22" fill={SHIRT} />
      <ellipse cx="60" cy="58" rx="35" ry="31" fill={SKIN} />
      <path d="M44 46 Q60 38 76 46" fill="none" stroke={DARK} strokeWidth="3" strokeLinecap="round" opacity=".7" />
      <ellipse cx="29" cy="98" rx="6.5" ry="13" transform="rotate(12 29 98)" fill={SHIRT} />
      <ellipse cx="91" cy="98" rx="6.5" ry="13" transform="rotate(-12 91 98)" fill={SHIRT} />
      <path d="M86 104 Q104 100 98 88 Q93 80 86 88" fill="none" stroke={DARK} strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="47" cy="116" rx="9" ry="4" fill={DARK} /><ellipse cx="73" cy="116" rx="9" ry="4" fill={DARK} />
    </g>
  );
}

export function Buhio({ size = 56, pose = 'front' }: { size?: number; pose?: Pose }) {
  return (
    <svg viewBox="0 0 120 124" width={size} height={size} aria-hidden="true" focusable="false" className="buhio" data-pose={pose}>
      {pose === 'back' ? <Back /> : <Front pose={pose} />}
    </svg>
  );
}
