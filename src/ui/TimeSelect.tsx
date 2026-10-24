import { MINUTE_STEPS } from '../domain/sleep';

const pad = (n: number) => String(n).padStart(2, '0');

/** startHour から24時間分を、10分刻みで並べる（夜をまたいでも途切れないように、就寝は18時始まり・起床は3時始まりなど） */
function timeOptions(startHour: number, current: string): string[] {
  const step = 60 / MINUTE_STEPS.length; // 10分
  const list: string[] = [];
  for (let i = 0; i < (24 * 60) / step; i++) {
    const total = (startHour * 60 + i * step) % 1440;
    list.push(`${pad(Math.floor(total / 60))}:${pad(total % 60)}`);
  }
  // 10分刻み以外の既存値（過去データなど）は、その値も選べるように残す
  if (current && !list.includes(current)) list.push(current);
  return list;
}

/**
 * 時刻の選択（1つのホイール、10分刻み）。
 * value が空のときは「未入力」。ただし ghost（初期値）があれば、薄い文字で ghost を表示し、
 * 選択画面（ホイール）も ghost の位置から始まる。触って変えたときに初めて値になる。
 */
export function TimeSelect({ label, value, ghost, startHour = 0, onChange }: { label: string; value: string; ghost?: string; startHour?: number; onChange: (v: string) => void }) {
  const shown = value || ghost || '';
  const isGhost = !value && !!ghost;
  return (
    <fieldset className="time">
      <legend>{label}{isGhost && <small className="muted">（未入力）</small>}</legend>
      <select aria-label={label} className={isGhost ? 'ghost' : ''} value={shown} onChange={(e) => onChange(e.target.value)}>
        <option value="">--</option>
        {timeOptions(startHour, value).map((t) => <option key={t} value={t}>{Number(t.slice(0, 2))}:{t.slice(3)}</option>)}
      </select>
    </fieldset>
  );
}
