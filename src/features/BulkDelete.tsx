import { useMemo, useState } from 'react';
import type { Repo } from '../db/repo';
import { formatJa } from '../domain/date';
import { REPEAT_LABEL } from '../domain/schedule';
import type { CalendarEvent } from '../domain/types';

const UNDO_MS = 10000;

/** 予定をまとめて削除する。名前で絞る・読み込んだ予定だけ・日付の範囲で絞り、選んだものを一度に消す（直後なら元に戻せる） */
export function BulkDelete({ repo, events, onChanged }: { repo: Repo; events: CalendarEvent[]; onChanged: () => void | Promise<void> }) {
  const [q, setQ] = useState('');
  const [onlyImported, setOnlyImported] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<CalendarEvent[] | null>(null);
  const [timer, setTimer] = useState<number | undefined>(undefined);
  const [err, setErr] = useState('');

  const shown = useMemo(
    () => events
      .filter((e) => (!onlyImported || e.source === 'ics') && (!q.trim() || e.title.includes(q.trim())) && (!from || (e.endDate ?? e.date) >= from) && (!to || e.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ja')),
    [events, onlyImported, q, from, to],
  );
  const shownIds = shown.map((e) => e.id);
  const sel = shownIds.filter((id) => picked.has(id)); // 絞り込みで見えなくなったものは、数えない（消さない）

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const remove = async () => {
    setErr('');
    if (sel.length === 0) return;
    if (!confirm(`選んだ${sel.length}件の予定を削除します（くりかえしの予定は、すべての日が消えます）。よろしいですか？\n消した直後なら「元に戻す」が出ます。`)) return;
    try {
      const deleted = await repo.deleteEvents(sel);
      setPicked(new Set());
      setUndo(deleted);
      window.clearTimeout(timer);
      setTimer(window.setTimeout(() => setUndo(null), UNDO_MS));
      await onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : '削除できませんでした'); }
  };
  const restore = async () => {
    if (!undo) return;
    const list = undo;
    setUndo(null);
    window.clearTimeout(timer);
    try { await repo.restoreEvents(list); await onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : '元に戻せませんでした'); }
  };

  return (
    <section className="card bulkdel" aria-label="予定をまとめて削除">
      <details>
        <summary><strong>予定をまとめて削除</strong></summary>
        <p className="muted small">消したい予定にチェックを入れて、まとめて削除できます。「名前で絞る」で「仕事」などと入れると、同じ名前の予定だけが並びます。</p>
        <label className="field">名前で絞る<input aria-label="名前で絞る" value={q} maxLength={50} onChange={(e) => setQ(e.target.value)} placeholder="例: 仕事" /></label>
        <div className="two">
          <label className="field">この日から<input type="date" aria-label="この日から" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field">この日まで<input type="date" aria-label="この日まで" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={onlyImported} onChange={(e) => setOnlyImported(e.target.checked)} />カレンダーファイルから読み込んだ予定だけ</label>
        <div className="row wrap">
          <button type="button" onClick={() => setPicked((p) => new Set([...p, ...shownIds]))} disabled={shown.length === 0}>表示中の{shown.length}件をすべて選ぶ</button>
          <button type="button" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>選びをすべて外す</button>
        </div>
        {shown.length === 0 ? <p className="muted small">当てはまる予定がありません。</p> : (
          <ul className="plain bulklist">
            {shown.map((e) => (
              <li key={e.id}>
                <label className="check">
                  <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} aria-label={`${e.title} ${formatJa(e.date)}`} />
                  <span><strong>{e.title}</strong> <small className="muted">{formatJa(e.date)}{e.endDate ? `〜${formatJa(e.endDate)}` : ''}{e.repeat ? `（${REPEAT_LABEL[e.repeat.freq]}）` : ''}</small></span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {err && <p role="alert" className="err">{err}</p>}
        <button type="button" className="danger" onClick={() => void remove()} disabled={sel.length === 0}>選んだ{sel.length}件を削除</button>
      </details>
      {undo && (
        <div className="undobar" role="status">
          <span>{undo.length}件の予定を消しました</span>
          <button type="button" onClick={() => void restore()}>元に戻す</button>
        </div>
      )}
    </section>
  );
}
