const pad = (n: number) => String(n).padStart(2, '0');
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

/** 時刻の選択（時と分を分けて、分は5分刻み）。value は "HH:MM"、空なら未入力 */
export function HourMinuteSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [h, m] = value ? value.split(':') : ['', ''];
  const mins = m && !MINUTES.includes(Number(m)) ? [...MINUTES, Number(m)].sort((a, b) => a - b) : MINUTES; // 5分刻み以外の既存値も残す
  return (
    <fieldset className="time hm">
      <legend>{label}</legend>
      <div className="hmrow">
        <select aria-label={`${label}の時`} value={h} onChange={(e) => onChange(e.target.value === '' ? '' : `${e.target.value}:${m || '00'}`)}>
          <option value="">--</option>
          {Array.from({ length: 24 }, (_, i) => <option key={i} value={pad(i)}>{i}時</option>)}
        </select>
        <select aria-label={`${label}の分`} value={m} disabled={!h} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
          {!h && <option value="">--</option>}
          {mins.map((x) => <option key={x} value={pad(x)}>{pad(x)}分</option>)}
        </select>
      </div>
    </fieldset>
  );
}
