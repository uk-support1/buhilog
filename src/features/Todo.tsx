import { useCallback, useEffect, useRef, useState } from 'react';
import type { Repo } from '../db/repo';
import { formatJa, isValidLocalDate, toLocalDate } from '../domain/date';
import { BOOST_NONE, boostActionsOf } from '../domain/boost';
import { MAX_NAME, TODO_LISTS, type BoostAction, type Todo } from '../domain/types';
import { WheelTime } from '../ui/WheelTime';

const LISTS: { id: Todo['list']; title: string; hint: string; placeholder: string }[] = [
  { id: 'shop', title: '買い物', hint: '買ったらタップで消えます', placeholder: '例: 牛乳 2本' },
  { id: 'todo', title: 'やること', hint: '近いうちにやること', placeholder: '例: 書類を出す' },
  { id: 'someday', title: 'いつか', hint: '急がないけれど、忘れたくないこと', placeholder: '例: 部屋の収納を見直す' },
];
const UNDO_MS = 6000;

/** 買い物・やること・いつか。日付とは関係なく、ずっと続くリスト。品名をタップすると消える（数秒は「元に戻す」が出る） */
export function TodoPage({ repo, onCount }: { repo: Repo; onCount?: (n: number) => void }) {
  const [items, setItems] = useState<Todo[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // 消した／カレンダーに移した直後だけ出す「元に戻す」
  const [undo, setUndo] = useState<{ todo: Todo; eventId?: string; label: string } | null>(null);
  // 「カレンダーへ」移すときの入力（日付・時刻）
  const [toCal, setToCal] = useState<{ todo: Todo; title: string; date: string; allDay: boolean; start: string; end: string } | null>(null);
  const [err, setErr] = useState('');
  // 「やる気がない時の対処法」: 朝の「上げる方法」と同じ一覧。タップで印がつくだけで、消えない（印は、ページを閉じると消える）
  const [boost, setBoost] = useState<BoostAction[]>(boostActionsOf());
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const [bName, setBName] = useState('');
  useEffect(() => { void repo.getSettings().then((s) => setBoost(boostActionsOf(s.boostActions))); }, [repo]);
  const timer = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    const all = await repo.listTodos();
    setItems(all);
    onCount?.(all.length);
  }, [repo, onCount]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const run = async (f: () => Promise<unknown>) => {
    setErr('');
    try { await f(); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : '操作に失敗しました'); }
  };
  const add = (list: Todo['list']) => {
    const text = (drafts[list] ?? '').trim();
    if (!text) return;
    void run(async () => { await repo.addTodo(list, text); setDrafts((d) => ({ ...d, [list]: '' })); });
  };
  const showUndo = (u: NonNullable<typeof undo>) => {
    setUndo(u);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  };
  const done = (t: Todo) => {
    void run(() => repo.deleteTodo(t.id));
    showUndo({ todo: t, label: `「${t.text.length > MAX_NAME ? `${t.text.slice(0, MAX_NAME)}…` : t.text}」を消しました` });
  };
  const restore = () => {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    window.clearTimeout(timer.current);
    void run(async () => {
      if (u.eventId) await repo.deleteEvent(u.eventId); // カレンダーに移したものは、予定を消してToDoに戻す
      await repo.restoreTodo(u.todo);
    });
  };
  /** カレンダーの予定にして、ToDoからは消す（日付は必須。終日、または時刻つき） */
  const moveToCalendar = async () => {
    if (!toCal) return;
    setErr('');
    const { todo, title, date, allDay, start, end } = toCal;
    if (!isValidLocalDate(date)) { setErr('日付を入れてください。'); return; }
    try {
      const ev = await repo.saveEvent({
        title: title.trim() || todo.text, date, allDay,
        ...(allDay ? {} : { startTime: start || undefined, endTime: end || undefined }),
        source: 'manual',
      });
      await repo.deleteTodo(todo.id);
      setToCal(null);
      await reload();
      showUndo({ todo, eventId: ev.id, label: `予定に移しました（${formatJa(date)}）` });
    } catch (e) { setErr(e instanceof Error ? e.message : '予定にできませんでした'); }
  };

  return (
    <div>
      {err && <p role="alert" className="err">{err}</p>}
      {LISTS.map((L) => {
        const list = items.filter((t) => t.list === L.id);
        return (
          <section key={L.id} className="card todo" aria-label={L.title}>
            <div className="row">
              <h2 className="grow">{L.title}{list.length > 0 && <small className="muted"> {list.length}件</small>}</h2>
            </div>
            <p className="muted small">{L.hint}</p>
            <form className="row" onSubmit={(e) => { e.preventDefault(); add(L.id); }}>
              <input aria-label={`${L.title}に追加`} placeholder={L.placeholder} maxLength={200} value={drafts[L.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [L.id]: e.target.value }))} />
              <button type="submit">追加</button>
            </form>
            {list.length === 0 ? <p className="muted small">空です。</p> : (
              <ul className="plain todolist">
                {list.map((t) => (
                  <li key={t.id} className="todorow">
                    <button type="button" className="todocheck" aria-label={`${t.text}を済みにして消す`} onClick={() => done(t)}>
                      <span className="box" aria-hidden="true" />
                      <span className="txt">{t.text}</span>
                    </button>
                    <button type="button" className="mini" aria-label={`${t.text}を書き直す`} onClick={() => { const n = prompt('書き直す', t.text)?.trim(); if (n) void run(() => repo.updateTodo(t.id, { text: n })); }}>編集</button>
                    <select className="mini" aria-label={`${t.text}を移す`} value="" onChange={(e) => {
                      const to = e.target.value;
                      if (to === 'calendar') setToCal({ todo: t, title: t.text, date: toLocalDate(), allDay: true, start: '', end: '' });
                      else if (to) void run(() => repo.updateTodo(t.id, { list: to as Todo['list'] }));
                    }}>
                      <option value="">移す</option>
                      {LISTS.filter((x) => x.id !== t.list).map((x) => <option key={x.id} value={x.id}>{x.title}へ</option>)}
                      <option value="calendar">📅へ</option>
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <section className="card todo" aria-label="やる気がない時の対処法">
        <h2>やる気がない時の対処法</h2>
        <p className="muted small">朝の「上げる方法」と同じ一覧です。タップすると印がつきます（消えません）。</p>
        <div className="boostlist">
          {boost.filter((b) => b.id !== BOOST_NONE && !b.archivedAt).map((b) => {
            const on = marks.has(b.id);
            return (
              <button key={b.id} type="button" role="checkbox" aria-checked={on} className={`boostbtn ${on ? 'sel' : ''}`}
                onClick={() => setMarks((m) => { const n = new Set(m); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}>
                {on ? '✓ ' : ''}{b.name}
              </button>
            );
          })}
        </div>
        <form className="row" onSubmit={(e) => {
          e.preventDefault();
          const n = bName.trim();
          if (!n) return;
          void run(async () => { const next = [...boost, { id: crypto.randomUUID(), name: n }]; await repo.saveSettings({ boostActions: next }); setBoost(boostActionsOf(next)); setBName(''); });
        }}>
          <input aria-label="対処法に追加" placeholder="例: 外の空気を吸う" maxLength={MAX_NAME} value={bName} onChange={(e) => setBName(e.target.value)} />
          <button type="submit">追加</button>
        </form>
        <p className="muted small">ここで足したものは、朝の「上げる方法」にも出ます。</p>
      </section>
      {toCal && (
        <div className="sheetbg" onClick={() => setToCal(null)}>
          <div className="sheet tocal" role="dialog" aria-label="カレンダーに移す" onClick={(e) => e.stopPropagation()}>
            <h3>カレンダーに移す</h3>
            <label className="field">予定の名前
              <input aria-label="予定の名前" maxLength={100} value={toCal.title} onChange={(e) => setToCal({ ...toCal, title: e.target.value })} />
            </label>
            <label className="field">日付
              <input type="date" aria-label="予定の日付" value={toCal.date} onChange={(e) => setToCal({ ...toCal, date: e.target.value })} />
            </label>
            <label className="check"><input type="checkbox" checked={toCal.allDay} onChange={(e) => setToCal({ ...toCal, allDay: e.target.checked })} />終日（時刻は決めない）</label>
            {!toCal.allDay && (
              <div className="two">
                <WheelTime label="開始時刻" value={toCal.start} onChange={(v) => setToCal({ ...toCal, start: v })} />
                <WheelTime label="終了時刻" value={toCal.end} initial={toCal.start || undefined} onChange={(v) => setToCal({ ...toCal, end: v })} />
              </div>
            )}
            {err && <p role="alert" className="err">{err}</p>}
            <div className="row wrap">
              <button type="button" className="primary" onClick={() => void moveToCalendar()}>予定にする</button>
              <button type="button" onClick={() => { setToCal(null); setErr(''); }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {undo && (
        <div className="undobar" role="status">
          <span>{undo.label}</span>
          <button type="button" onClick={restore}>元に戻す</button>
        </div>
      )}
    </div>
  );
}
export { TODO_LISTS };
