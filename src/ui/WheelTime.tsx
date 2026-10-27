import { useEffect, useRef, useState } from 'react';

const ITEM = 44; // 1行の高さ(px)。CSSの .wheel li と同じ
const pad = (n: number) => String(n).padStart(2, '0');
export const WHEEL_MINUTES = [0, 15, 30, 45];

/** 縦に回す1列のメーター（スクロールして止まった行が選ばれる。行をタップしても選べる） */
function Wheel({ label, items, index, onIndex }: { label: string; items: string[]; index: number; onIndex: (i: number) => void }) {
  const ref = useRef<HTMLUListElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { if (ref.current) ref.current.scrollTop = index * ITEM; }, []); // 開いたとき、選ばれている行へ
  const settle = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
      if (i !== index) onIndex(i);
    }, 90);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <ul className="wheel" role="listbox" aria-label={label} ref={ref} onScroll={settle}>
      {items.map((t, i) => (
        <li key={t} role="option" aria-selected={i === index} className={i === index ? 'sel' : ''}
          onClick={() => { onIndex(i); ref.current?.scrollTo?.({ top: i * ITEM, behavior: 'smooth' }); }}>{t}</li>
      ))}
    </ul>
  );
}

/**
 * 時刻の選択。ボタンを押すと、「時」と「分」の2つのメーターが同時に出て、回して選ぶ（分は15分刻み）。
 * value は "HH:MM"、空なら未入力。initial は、未入力のとき最初に合わせておく時刻。
 */
export function WheelTime({ label, value, initial = '09:00', onChange }: { label: string; value: string; initial?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState(9);
  const [m, setM] = useState(0);
  const start = value || initial;
  const startMin = Number(start.slice(3, 5));
  const minutes = WHEEL_MINUTES.includes(startMin) ? WHEEL_MINUTES : [...WHEEL_MINUTES, startMin].sort((a, b) => a - b); // 15分刻み以外の既存値も残す
  const show = () => { setH(Number(start.slice(0, 2))); setM(minutes.indexOf(startMin)); setOpen(true); };
  const close = () => setOpen(false);
  return (
    <fieldset className="time">
      <legend>{label}</legend>
      <button type="button" className="timebtn" aria-label={label} onClick={show}>{value ? `${Number(value.slice(0, 2))}:${value.slice(3)}` : '--:--'}</button>
      {open && (
        <div className="sheetbg" onClick={close}>
          <div className="sheet" role="dialog" aria-label={`${label}を選ぶ`} onClick={(e) => e.stopPropagation()}>
            <h3>{label}</h3>
            <div className="wheels">
              <div className="band" aria-hidden="true" />
              <Wheel label={`${label}の時`} items={Array.from({ length: 24 }, (_, i) => `${i}時`)} index={h} onIndex={setH} />
              <Wheel label={`${label}の分`} items={minutes.map((x) => `${pad(x)}分`)} index={m} onIndex={setM} />
            </div>
            <div className="row wrap">
              <button type="button" className="primary" onClick={() => { onChange(`${pad(h)}:${pad(minutes[m])}`); close(); }}>決定</button>
              <button type="button" onClick={close}>キャンセル</button>
              {value && <button type="button" onClick={() => { onChange(''); close(); }}>空にする</button>}
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}
