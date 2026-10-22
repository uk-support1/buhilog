import { useCallback, useEffect, useState } from 'react';
import type { Repo } from '../db/repo';
import { MAX_NAME, type Approach, type Problem } from '../domain/types';

export function Manage({ repo }: { repo: Repo }) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [approaches, setApproaches] = useState<Approach[]>([]);
  const [err, setErr] = useState('');
  const reload = useCallback(async () => {
    setProblems(await repo.listProblems(true));
    setApproaches(await repo.listApproaches(true));
  }, [repo]);
  useEffect(() => { void reload(); }, [reload]);
  const run = async (f: () => Promise<unknown>) => {
    setErr('');
    try { await f(); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : '操作に失敗しました'); }
  };

  const [pName, setPName] = useState('');
  const [aName, setAName] = useState('');
  const [aLinks, setALinks] = useState<string[]>([]);
  const [linkEditId, setLinkEditId] = useState<string | null>(null);
  const activeP = problems.filter((p) => !p.archivedAt);
  const archivedP = problems.filter((p) => p.archivedAt);
  const activeA = approaches.filter((a) => !a.archivedAt);
  const archivedA = approaches.filter((a) => a.archivedAt);
  const nameOf = (id: string) => problems.find((p) => p.id === id)?.name ?? '（不明）';

  const rename = (cur: string) => prompt('新しい名前', cur)?.trim();

  return (
    <div>
      {err && <p role="alert" className="err">{err}</p>}
      <section className="card">
        <h2>困りごと</h2>
        <ul className="plain">
          {activeP.map((p, i) => (
            <li key={p.id} className="row">
              <span className="grow">{p.name}</span>
              <button aria-label={`${p.name}を上へ`} disabled={i === 0} onClick={() => run(() => repo.moveProblem(p.id, -1))}>↑</button>
              <button aria-label={`${p.name}を下へ`} disabled={i === activeP.length - 1} onClick={() => run(() => repo.moveProblem(p.id, 1))}>↓</button>
              <button onClick={() => { const n = rename(p.name); if (n) void run(() => repo.updateProblem(p.id, { name: n })); }}>名前変更</button>
              <button onClick={() => run(() => repo.setProblemArchived(p.id, true))}>アーカイブ</button>
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={(e) => { e.preventDefault(); const n = pName.trim(); if (!n) return; void run(async () => { await repo.addProblem(n); setPName(''); }); }}>
          <input aria-label="新しい困りごと" placeholder="例: 右肩の痛み" maxLength={MAX_NAME} value={pName} onChange={(e) => setPName(e.target.value)} />
          <button type="submit">追加</button>
        </form>
        {archivedP.length > 0 && (
          <details>
            <summary>アーカイブ済み（過去の記録は残ります）</summary>
            <ul className="plain">
              {archivedP.map((p) => (
                <li key={p.id} className="row"><span className="grow">{p.name}</span>
                  <button onClick={() => run(() => repo.setProblemArchived(p.id, false))}>元に戻す</button></li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card">
        <h2>試すこと（アプローチ）</h2>
        <ul className="plain">
          {activeA.map((a) => (
            <li key={a.id} className="row wrap">
              <span className="grow">
                {a.name}
                <small className={a.linkedProblemIds.length ? 'muted' : 'warn-text'}>
                  {' '}{a.linkedProblemIds.length ? a.linkedProblemIds.map(nameOf).join('、') : '（対象の困りごとが未設定）'}
                </small>
              </span>
              <button onClick={() => setLinkEditId(linkEditId === a.id ? null : a.id)}>対象を変更</button>
              <button onClick={() => { const n = rename(a.name); if (n) void run(() => repo.updateApproach(a.id, { name: n })); }}>名前変更</button>
              <button onClick={() => run(() => repo.setApproachArchived(a.id, true))}>アーカイブ</button>
              {linkEditId === a.id && (
                <fieldset className="grow-full">
                  <legend>「{a.name}」の対象の困りごと（ふりかえりの比較に使います）</legend>
                  {activeP.map((p) => (
                    <label key={p.id} className="check">
                      <input
                        type="checkbox"
                        checked={a.linkedProblemIds.includes(p.id)}
                        onChange={(e) =>
                          void run(() =>
                            repo.updateApproach(a.id, {
                              linkedProblemIds: e.target.checked
                                ? [...a.linkedProblemIds, p.id]
                                : a.linkedProblemIds.filter((x) => x !== p.id),
                            }),
                          )
                        }
                      />
                      {p.name}
                    </label>
                  ))}
                </fieldset>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); const n = aName.trim(); if (!n) return; void run(async () => { await repo.addApproach(n, aLinks); setAName(''); setALinks([]); }); }}>
          <div className="row">
            <input aria-label="新しいアプローチ" placeholder="例: ストレッチ" maxLength={MAX_NAME} value={aName} onChange={(e) => setAName(e.target.value)} />
            <button type="submit">追加</button>
          </div>
          <fieldset>
            <legend>対象の困りごと（複数可）</legend>
            {activeP.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" checked={aLinks.includes(p.id)}
                  onChange={(e) => setALinks((l) => e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id))} />
                {p.name}
              </label>
            ))}
          </fieldset>
        </form>
        {archivedA.length > 0 && (
          <details>
            <summary>アーカイブ済み</summary>
            <ul className="plain">
              {archivedA.map((a) => (
                <li key={a.id} className="row"><span className="grow">{a.name}</span>
                  <button onClick={() => run(() => repo.setApproachArchived(a.id, false))}>元に戻す</button></li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
