import { PROBLEM_MAX, PROBLEM_MIN } from '../domain/scale';

interface Props {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}

/** 困りごとの点数（1〜5。5＝いちばん良い、1＝調子が悪い）。未入力(null)は別に選べる。 */
export function ScoreInput({ label, value, onChange }: Props) {
  const nums = Array.from({ length: PROBLEM_MAX - PROBLEM_MIN + 1 }, (_, i) => PROBLEM_MIN + i);
  return (
    <div role="radiogroup" aria-label={label} className="rating score">
      {nums.map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} className={`s${n} ${value === n ? 'sel' : ''}`} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
      <button type="button" role="radio" aria-checked={value == null} className={`skip ${value == null ? 'sel' : ''}`} onClick={() => onChange(null)}>
        未入力
      </button>
    </div>
  );
}
