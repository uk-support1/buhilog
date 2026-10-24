import { MINUTE_STEPS } from '../domain/sleep';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

/**
 * 時刻の選択（時 + 分）。分は10分単位。
 * value が空のときは「未入力」。ただし ghost（初期値）があれば、薄い文字で ghost を表示し、
 * 選択画面（ホイール）も ghost の位置から始まる。触って変えたときに初めて値になる。
 */
export function TimeSelect({ label, value, ghost, onChange }: { label: string; value: string; ghost?: string; onChange: (v: string) => void }) {
  const shown = value || ghost || '';
  const isGhost = !value && !!ghost;
  const [h, m] = shown ? shown.split(':') : ['', ''];
  // 10分単位以外の既存値（過去データなど）は、その値も選べるように残す
  const mins: string[] = m && !(MINUTE_STEPS as readonly string[]).includes(m) ? [...MINUTE_STEPS, m].sort() : [...MINUTE_STEPS];
  const set = (nh: string, nm: string) => onChange(nh === '' ? '' : `${nh}:${nm || '00'}`);
  const cls = isGhost ? 'ghost' : '';
  return (
    <fieldset className="time">
      <legend>{label}{isGhost && <small className="muted">（未入力）</small>}</legend>
      <select aria-label={`${label} 時`} className={cls} value={h} onChange={(e) => set(e.target.value, m)}>
        <option value="">--</option>
        {HOURS.map((x) => <option key={x} value={x}>{Number(x)}時</option>)}
      </select>
      <select aria-label={`${label} 分`} className={cls} value={m || '00'} disabled={h === ''} onChange={(e) => set(h, e.target.value)}>
        {mins.map((x) => <option key={x} value={x}>{x}分</option>)}
      </select>
    </fieldset>
  );
}
