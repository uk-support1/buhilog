import { MINUTE_STEPS } from '../domain/sleep';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

/** 時刻の選択（時 + 分）。分は10分単位。時を「--」にすると未設定になる。 */
export function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [h, m] = value ? value.split(':') : ['', ''];
  // 10分単位以外の既存値（過去データなど）は、その値も選べるように残す
  const mins: string[] = m && !(MINUTE_STEPS as readonly string[]).includes(m) ? [...MINUTE_STEPS, m].sort() : [...MINUTE_STEPS];
  const set = (nh: string, nm: string) => onChange(nh === '' ? '' : `${nh}:${nm || '00'}`);
  return (
    <fieldset className="time">
      <legend>{label}</legend>
      <select aria-label={`${label} 時`} value={h} onChange={(e) => set(e.target.value, m)}>
        <option value="">--</option>
        {HOURS.map((x) => <option key={x} value={x}>{Number(x)}時</option>)}
      </select>
      <select aria-label={`${label} 分`} value={m || '00'} disabled={h === ''} onChange={(e) => set(h, e.target.value)}>
        {mins.map((x) => <option key={x} value={x}>{x}分</option>)}
      </select>
    </fieldset>
  );
}
