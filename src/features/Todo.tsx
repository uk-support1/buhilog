import { useCallback, useEffect, useRef, useState } from 'react';
import type { Repo } from '../db/repo';
import { MAX_NAME, TODO_LISTS, type Todo } from '../domain/types';

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
  const [undo, setUndo] = useState<Todo | null>(null);
  const [err, setErr] = useState('');
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
  const done = (t: Todo) => {
    void run(() => repo.deleteTodo(t.id));
    setUndo(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  };
  const restore = () => {
    if (!undo) return;
    const t = undo;
    setUndo(null);
    window.clearTimeout(timer.current);
    void run(() => repo.restoreTodo(t));
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
                    <select className="mini" aria-label={`${t.text}を移す`} value="" onChange={(e) => { const to = e.target.value as Todo['list']; if (to) void run(() => repo.updateTodo(t.id, { list: to })); }}>
                      <option value="">移す</option>
                      {LISTS.filter((x) => x.id !== t.list).map((x) => <option key={x.id} value={x.id}>{x.title}へ</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {undo && (
        <div className="undobar" role="status">
          <span>「{undo.text.length > MAX_NAME ? `${undo.text.slice(0, MAX_NAME)}…` : undo.text}」を消しました</span>
          <button type="button" onClick={restore}>元に戻す</button>
        </div>
      )}
    </div>
  );
}
export { TODO_LISTS };
