import { useCallback, useEffect, useState } from 'react';
import type { Repo } from '../db/repo';
import { BOOST_NONE, boostActionsOf } from '../domain/boost';
import { MAX_NAME, type Approach, type BoostAction, type Problem } from '../domain/types';

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

  const [boost, setBoost] = useState<BoostAction[]>(boostActionsOf());
  const [bName, setBName] = useState('');
  useEffect(() => { void repo.getSettings().then((s) => setBoost(boostActionsOf(s.boostActions))); }, [repo]);
  const saveBoost = (next: BoostAction[]) => run(async () => { await repo.saveSettings({ boostActions: next }); setBoost(boostActionsOf(next)); });
  const [pName, setPName] = useState('');
  const [pAfter, setPAfter] = useState('');
  const [pFactor, setPFactor] = useState(false);
  const [aName, setAName] = useState('');
  const [aLinks, setALinks] = useState<string[]>([]);
  const [aUnder, setAUnder] = useState('');
  const [aDone, setADone] = useState('');
  const [aNotDone, setANotDone] = useState('');
  const [aNote, setANote] = useState('');
  const [linkEditId, setLinkEditId] = useState<string | null>(null);
  const activeP = problems.filter((p) => !p.archivedAt);
  const archivedP = problems.filter((p) => p.archivedAt);
  const activeA = approaches.filter((a) => !a.archivedAt);
  const archivedA = approaches.filter((a) => a.archivedAt);
  const nameOf = (id: string) => problems.find((p) => p.id === id)?.name ?? '（不明）';

  const rename = (cur: string) => prompt('新しい名前', cur)?.trim();
  // 「グループ／小見出し」の形式で入力（小見出しは省略可）。空にするとグループなし
  const askGroup = (x: { group?: string; section?: string }) => {
    const cur = [x.group, x.section].filter(Boolean).join('／');
    const v = prompt('グループ名（小見出しがあれば「グループ／小見出し」）。空欄でグループなし', cur);
    if (v === null) return null;
    const [g, s] = v.split(/[／/]/).map((t) => t.trim());
    return { group: g || undefined, section: g ? s || undefined : undefined };
  };
  const groupLabel = (x: { group?: string; section?: string }) => [x.group, x.section].filter(Boolean).join('／');

  return (
    <div>
      {err && <p role="alert" className="err">{err}</p>}
      <section className="card">
        <h2>困りごと</h2>
        <ul className="plain">
          {activeP.map((p, i) => (
            <li key={p.id} className="row wrap manage">
              <span className="grow">{p.name}{groupLabel(p) && <small className="muted"> [{groupLabel(p)}]</small>}</span>
              <button aria-label={`${p.name}を上へ`} disabled={i === 0} onClick={() => run(() => repo.moveProblem(p.id, -1))}>↑</button>
              <button aria-label={`${p.name}を下へ`} disabled={i === activeP.length - 1} onClick={() => run(() => repo.moveProblem(p.id, 1))}>↓</button>
              <button onClick={() => { const g = askGroup(p); if (g) void run(() => repo.updateProblem(p.id, g)); }}>グループ</button>
              <button onClick={() => { const n = rename(p.name); if (n) void run(() => repo.updateProblem(p.id, { name: n })); }}>名前変更</button>
              <button onClick={() => run(() => repo.setProblemArchived(p.id, true))}>アーカイブ</button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); const n = pName.trim(); if (!n) return; void run(async () => { await repo.addProblem(n, undefined, undefined, undefined, { afterId: pAfter || undefined, asFactor: pFactor }); setPName(''); setPAfter(''); setPFactor(false); }); }}>
          <div className="row">
            <input aria-label="新しい困りごと" placeholder="例: 右肩の痛み" maxLength={MAX_NAME} value={pName} onChange={(e) => setPName(e.target.value)} />
            <button type="submit">追加</button>
          </div>
          <label className="field">入れる場所（選んだ項目の下に、同じグループで入ります）
            <select aria-label="この項目の下に入れる" value={pAfter} onChange={(e) => setPAfter(e.target.value)}>
              <option value="">いちばん最後</option>
              {activeP.map((p) => <option key={p.id} value={p.id}>{p.name}の下{groupLabel(p) ? `（${groupLabel(p)}）` : ''}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={pFactor} onChange={(e) => setPFactor(e.target.checked)} />ほかの困りごとの「要因」としても比べる</label>
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
            <li key={a.id} className="row wrap manage">
              <span className="grow">
                {a.name}{groupLabel(a) && <small className="muted"> [{groupLabel(a)}]</small>}{a.underProblemId && <small className="muted"> ［{nameOf(a.underProblemId)}の下に表示］</small>}
                <small className={a.linkedProblemIds.length ? 'muted' : 'warn-text'}>
                  {' '}{a.linkedProblemIds.length ? a.linkedProblemIds.map(nameOf).join('、') : '（対象の困りごとが未設定）'}
                </small>
              </span>
              <button onClick={() => { const g = askGroup(a); if (g) void run(() => repo.updateApproach(a.id, g)); }}>グループ</button>
              <button onClick={() => {
                const d = prompt('「実施した」側のボタンの名前（例: 飲んだ）。空欄で「実施した」に戻す', a.doneLabel ?? '');
                if (d === null) return;
                const n = prompt('「実施しなかった」側のボタンの名前（例: 飲んでない）。空欄で「実施しなかった」に戻す', a.notDoneLabel ?? '');
                if (n === null) return;
                void run(() => repo.updateApproach(a.id, { doneLabel: d.trim() || undefined, notDoneLabel: n.trim() || undefined }));
              }}>ボタン名</button>
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
        <form onSubmit={(e) => { e.preventDefault(); const n = aName.trim(); if (!n) return; void run(async () => { await repo.addApproach(n, aLinks, undefined, undefined, undefined, { underProblemId: aUnder || undefined, doneLabel: aDone.trim() || undefined, notDoneLabel: aNotDone.trim() || undefined, noteLabel: aNote.trim() || undefined }); setAName(''); setALinks([]); setAUnder(''); setADone(''); setANotDone(''); setANote(''); }); }}>
          <div className="row">
            <input aria-label="新しいアプローチ" placeholder="例: ストレッチ" maxLength={MAX_NAME} value={aName} onChange={(e) => setAName(e.target.value)} />
            <button type="submit">追加</button>
          </div>
          <label className="field">表示する場所（選ぶと、その困りごとの「すぐ下」に〇／×で出ます）
            <select aria-label="この困りごとの下に出す" value={aUnder} onChange={(e) => setAUnder(e.target.value)}>
              <option value="">ふつうの一覧に出す</option>
              {activeP.map((p) => <option key={p.id} value={p.id}>{p.name}の下{groupLabel(p) ? `（${groupLabel(p)}）` : ''}</option>)}
            </select>
          </label>
          <div className="two">
            <label className="field">「実施した」側のボタン名（任意）<input aria-label="実施した側のボタン名" placeholder="例: 〇" maxLength={MAX_NAME} value={aDone} onChange={(e) => setADone(e.target.value)} /></label>
            <label className="field">「しなかった」側のボタン名（任意）<input aria-label="しなかった側のボタン名" placeholder="例: ×" maxLength={MAX_NAME} value={aNotDone} onChange={(e) => setANotDone(e.target.value)} /></label>
          </div>
          <label className="field">「実施した」のときに出すメモ欄の名前（任意）<input aria-label="メモ欄の名前" placeholder="例: 何をやったか" maxLength={MAX_NAME} value={aNote} onChange={(e) => setANote(e.target.value)} /></label>
          <fieldset>
            <legend>対象の困りごと（複数可。上で場所を選ぶと、その困りごとは自動で対象になります）</legend>
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

      <section className="card" aria-label="調子を上げる方法の設定">
        <h2>調子が低い朝の「上げる方法」</h2>
        <p className="muted small">朝の調子が3以下のとき、「記録」の画面にその場で出す一覧です。「何もしなかった」は、比べるために、いつも最後に出ます。</p>
        <ul className="plain">
          {boost.filter((b) => b.id !== BOOST_NONE && !b.archivedAt).map((b) => (
            <li key={b.id} className="row wrap manage">
              <span className="grow">{b.name}</span>
              <button onClick={() => { const n = rename(b.name); if (n) void saveBoost(boost.map((x) => (x.id === b.id ? { ...x, name: n } : x))); }}>名前変更</button>
              <button onClick={() => saveBoost(boost.map((x) => (x.id === b.id ? { ...x, archivedAt: Date.now() } : x)))}>はずす</button>
            </li>
          ))}
          <li className="row manage"><span className="grow muted">何もしなかった（固定）</span></li>
        </ul>
        <form className="row" onSubmit={(e) => { e.preventDefault(); const n = bName.trim(); if (!n) return; void saveBoost([...boost, { id: crypto.randomUUID(), name: n }]); setBName(''); }}>
          <input aria-label="新しい上げる方法" placeholder="例: 外の空気を吸う" maxLength={MAX_NAME} value={bName} onChange={(e) => setBName(e.target.value)} />
          <button type="submit">追加</button>
        </form>
        {boost.some((b) => b.archivedAt) && (
          <details>
            <summary>はずしたもの（過去の記録は残ります）</summary>
            <ul className="plain">
              {boost.filter((b) => b.archivedAt).map((b) => (
                <li key={b.id} className="row"><span className="grow">{b.name}</span>
                  <button onClick={() => saveBoost(boost.map((x) => (x.id === b.id ? { id: x.id, name: x.name } : x)))}>元に戻す</button></li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
