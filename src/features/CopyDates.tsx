import { useMemo, useState } from 'react';
import { addDays, formatJa, toLocalDate } from '../domain/date';
import { holidayName } from '../domain/holidays';
import { WEEKDAY_LABEL, weekdayOf } from '../domain/schedule';

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split('-').map(Number);
  const t = mo - 1 + delta;
  return `${y + Math.floor(t / 12)}-${String((((t % 12) + 12) % 12) + 1).padStart(2, '0')}-01`;
};

/** 同じ予定を入れる「ほかの日」を、カレンダーでタップして複数選ぶ（元の日は除く） */
export function CopyDates({ base, value, onChange }: { base: string; value: string[]; onChange: (v: string[]) => void }) {
  const [month, setMonth] = useState(monthStart(base || toLocalDate()));
  const start = addDays(month, -weekdayOf(month));
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(start, i)), [start]);
  const sel = new Set(value);
  const toggle = (d: string) => onChange(sel.has(d) ? value.filter((x) => x !== d) : [...value, d].sort());
  return (
    <details className="copydates" open={value.length > 0}>
      <summary>ほかの日にも同じ予定を入れる{value.length > 0 && `（${value.length}日 選択中）`}</summary>
      <div className="calhead">
        <button type="button" aria-label="コピー先：前の月" onClick={() => setMonth(shiftMonth(month, -1))}>◀</button>
        <strong>{month.slice(0, 4)}年{Number(month.slice(5, 7))}月</strong>
        <button type="button" aria-label="コピー先：次の月" onClick={() => setMonth(shiftMonth(month, 1))}>▶</button>
      </div>
      <div className="calgrid mini" role="group" aria-label="コピー先の日を選ぶ">
        {WEEKDAY_LABEL.map((w, i) => <div key={w} className={`wd wd${i}`}>{w}</div>)}
        {days.map((d, di) => {
          const inMonth = d.slice(0, 7) === month.slice(0, 7);
          const isBase = d === base;
          const cls = ['day', inMonth ? '' : 'out', sel.has(d) ? 'pick' : '', holidayName(d) || di % 7 === 0 ? 'red' : di % 7 === 6 ? 'blue' : ''].join(' ');
          return (
            <button key={d} type="button" className={cls} disabled={isBase} aria-pressed={sel.has(d)} aria-label={`${formatJa(d)}${isBase ? '（元の日）' : ''}`} onClick={() => toggle(d)}>
              <span className="num">{Number(d.slice(8))}</span>
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <div className="chips">
          {value.map((d) => <button key={d} type="button" className="chip" aria-label={`${formatJa(d)}を外す`} onClick={() => toggle(d)}>{formatJa(d)} ✕</button>)}
          <button type="button" onClick={() => onChange([])}>すべて外す</button>
        </div>
      )}
    </details>
  );
}
