import { useEffect, useState } from 'react';
import type { Repo } from '../db/repo';
import { formatJa, toLocalDate } from '../domain/date';
import { colorOf, eventsOn, timeLabel, type Occurrence } from '../domain/schedule';

/** 「今日」画面の一番上に出る、その日の予定 */
export function TodayEvents({ repo, date, onOpen }: { repo: Repo; date: string; onOpen: (date: string) => void }) {
  const [list, setList] = useState<Occurrence[] | null>(null);
  useEffect(() => {
    let live = true;
    void repo.listEvents().then((evs) => { if (live) setList(eventsOn(evs, date)); });
    return () => { live = false; };
  }, [repo, date]);
  if (list === null) return null;
  const title = date === toLocalDate() ? '今日の予定' : `${formatJa(date)}の予定`;
  return (
    <section className="card events" aria-label={title}>
      <div className="row">
        <h2 className="grow">{title}{list.length > 0 && <small className="muted"> {list.length}件</small>}</h2>
        <button type="button" onClick={() => onOpen(date)}>{list.length ? 'カレンダーを開く' : '予定を追加'}</button>
      </div>
      {list.length === 0 ? (
        <p className="muted small">予定はありません。</p>
      ) : (
        <ul className="plain">
          {list.map((o, i) => (
            <li key={`${o.event.id}-${i}`} className="evrow" style={{ borderLeftColor: colorOf(o.event) }}>
              <span className="evtime">{timeLabel(o)}</span>
              <span className="evmain">
                <strong>{o.event.title}</strong>
                {o.event.place && <small className="muted"> ／{o.event.place}</small>}
                {o.event.memo && <small className="evmemo muted">{o.event.memo}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
