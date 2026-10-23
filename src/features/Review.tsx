import { useEffect, useMemo, useState } from 'react';
import type { Repo } from '../db/repo';
import { buildSeries, compareApproach, PERIODS, type Period } from '../domain/analytics';
import { toLocalDate } from '../domain/date';
import { buildGroups, hasNamedGroups } from '../domain/groups';
import { rankFactors, STRENGTH_LABEL, type Candidate } from '../domain/correlation';
import { buildNarrative, EVIDENCE_LABEL } from '../domain/narrative';
import { describeComparison } from '../domain/text';
import type { Approach, DailyEntry, Problem } from '../domain/types';
import { Buhio } from '../ui/Buhio';
import { TrendChart } from '../ui/TrendChart';

export function Review({ repo }: { repo: Repo }) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [approaches, setApproaches] = useState<Approach[]>([]);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [pid, setPid] = useState<string>('');
  const [choice, setChoice] = useState<Period | 'all'>(28);
  const [loaded, setLoaded] = useState(false);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [ps, as, es] = await Promise.all([repo.listProblems(true), repo.listApproaches(true), repo.listEntries()]);
      setProblems(ps); setApproaches(as); setEntries(es);
      setGroupOrder((await repo.getSettings()).groupOrder ?? []);
      setPid((cur) => cur || ps.find((p) => !p.archivedAt)?.id || ps[0]?.id || '');
      setLoaded(true);
    })();
  }, [repo]);

  const end = toLocalDate();
  // 「全期間」は、最初の記録の日から今日まで（上限730日）
  const firstDate = entries.reduce<string | null>((m, e) => (m === null || e.localDate < m ? e.localDate : m), null);
  const allDays = firstDate ? Math.max(7, Math.min(730, Math.round((Date.parse(`${end}T00:00:00`) - Date.parse(`${firstDate}T00:00:00`)) / 86_400_000) + 1)) : 28;
  const period = choice === 'all' ? allDays : choice;
  const series = useMemo(() => (pid ? buildSeries(entries, pid, end, period) : null), [entries, pid, end, period]);
  const problem = problems.find((p) => p.id === pid);
  // 要因の候補（試したこと・睡眠・量）。試したことの「対象の困りごと」の設定にかかわらず、記録のある要因すべてを比べる
  const rank = useMemo(() => (pid ? rankFactors(entries, approaches, pid, end, period) : null), [entries, approaches, pid, end, period]);
  useEffect(() => { setOpenKey(null); }, [pid, choice]);
  const optionGroups = useMemo(() => {
    const gs = buildGroups(problems, [], groupOrder).filter((g) => g.sections.some((s) => s.problems.length));
    return hasNamedGroups(gs) ? gs.map((g) => ({ label: g.name, items: g.sections.flatMap((s) => s.problems) })) : [{ label: '', items: problems }];
  }, [problems, groupOrder]);

  // 記録がある or 対象の困りごとに紐づくアプローチ（アーカイブ済みも、記録があれば含める）
  const relevant = approaches.filter(
    (a) => a.linkedProblemIds.includes(pid) && (!a.archivedAt || entries.some((e) => e.approachStatuses[a.id] && e.approachStatuses[a.id] !== 'unknown')),
  );

  if (!loaded) return null;
  if (problems.length === 0) return <section className="card"><Buhio size={80} pose="standing" /><h2>ふりかえり</h2><p>困りごとを登録して記録をはじめると、ここに推移が表示されます。</p></section>;

  return (
    <div>
      <section className="card">
        <label className="field">
          困りごと
          <select value={pid} onChange={(e) => setPid(e.target.value)}>
            {optionGroups.map((g) =>
              g.label ? (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((p) => <option key={p.id} value={p.id}>{p.name}{p.archivedAt ? '（アーカイブ済み）' : ''}</option>)}
                </optgroup>
              ) : (
                g.items.map((p) => <option key={p.id} value={p.id}>{p.name}{p.archivedAt ? '（アーカイブ済み）' : ''}</option>)
              ),
            )}
          </select>
        </label>
        <div className="seg" role="radiogroup" aria-label="期間">
          {PERIODS.map((d) => (
            <button key={d} role="radio" aria-checked={choice === d} className={choice === d ? 'sel' : ''} onClick={() => setChoice(d)}>直近{d}日</button>
          ))}
          <button role="radio" aria-checked={choice === 'all'} className={choice === 'all' ? 'sel' : ''} onClick={() => setChoice('all')}>全期間</button>
        </div>
      </section>

      {series && problem && (
        <section className="card">
          <h2>{problem.name}の推移</h2>
          <p>{period}日のうち、評価を記録したのは <strong>{series.recorded}日</strong>、未記録は {series.missing}日です。</p>
          {series.recorded === 0 ? (
            <p className="muted">この期間には評価の記録がありません。記録があるとグラフが表示されます。</p>
          ) : (
            <TrendChart series={series} name={problem.name} />
          )}
          <details>
            <summary>週ごとの平均（記録のある日のみ）</summary>
            <ul>{series.weeks.map((w) => <li key={w.from}>{w.from}〜{w.to}: {w.mean == null ? '記録なし' : `${w.mean.toFixed(1)}（${w.n}日分）`}</li>)}</ul>
          </details>
        </section>
      )}

      {problem && rank && (
        <section className="card" aria-labelledby="rank-h">
          <h2 id="rank-h">関連がありそうな要因（上位{rank.top.length || 5}つ）</h2>
          <p className="muted small">
            同じ日の記録どうしを比べた「手がかり」です。{choice === 'all' ? `全期間（${period}日間）` : `直近${period}日`}のうち評価のある{rank.ratedDays}日分で、{rank.tested}個の要因を比べました。
            原因や効果を示すものではありません。押すと、くわしい内容が見られます。
          </p>
          {rank.top.length === 0 ? (
            <p>
              まだ比べられる記録が足りません。要因ごとに、数値（睡眠時間など）は14日分以上、実施した日・しなかった日はそれぞれ5日分以上の記録がたまると表示されます。
              「直近28日」や「直近56日」に切り替えると、見つかりやすくなります。
            </p>
          ) : (
            <>
              {rank.top.every((c) => c.evidence === 'weak') && (
                <p className="warn">はっきりした関連は、まだ見つかっていません。下は、参考程度の弱い手がかりです。</p>
              )}
              <ol className="cands">
                {rank.top.map((c, i) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      className={`cand ${c.positive ? 'plus' : 'minus'}`}
                      aria-expanded={openKey === c.key}
                      onClick={() => setOpenKey(openKey === c.key ? null : c.key)}
                    >
                      <span className="rankno">{i + 1}</span>
                      <span className="cmain">
                        <span className="cname"><strong>{c.name}</strong><small className="muted"> {c.group}</small></span>
                        <span className="chead">{c.positive ? '▲ ' : '▼ '}{buildNarrative(problem.name, c).headline}</span>
                        <span className="meter" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round((Math.abs(c.rho) / 0.7) * 100))}%` }} /></span>
                        <span className="badges">
                          <span className={`badge ev-${c.evidence}`}>{EVIDENCE_LABEL[c.evidence]}</span>
                          <span className="badge">{c.n}日分</span>
                        </span>
                      </span>
                      <span className="chev" aria-hidden="true">{openKey === c.key ? '▲' : '▼'}</span>
                    </button>
                    {openKey === c.key && <CandidateDetail c={c} problemName={problem.name} />}
                  </li>
                ))}
              </ol>
              <p className="muted small">たくさんの要因を比べているため、偶然による見かけの関連が混ざることがあります。記録していない要因も影響します。</p>
            </>
          )}
        </section>
      )}

      {problem && (
        <details className="card">
          <summary><strong>試したこと別の詳しい比較（実施した日／しなかった日）</strong></summary>
          <h2>試したこととの関連</h2>
          <p className="muted small">順位づけはしません。実施した日と、しなかった日の平均を並べて見るだけです。</p>
          {relevant.length === 0 && (
            <div>
              <p>この困りごとに紐づくアプローチがありません。</p>
              {approaches.filter((a) => !a.archivedAt && !a.linkedProblemIds.includes(pid)).length > 0 ? (
                <p>
                  登録済みの試したこと（{approaches.filter((a) => !a.archivedAt && !a.linkedProblemIds.includes(pid)).map((a) => `「${a.name}」`).join('')}）は、
                  この困りごとにまだ紐づいていません。「記録」→「管理」→「対象を変更」で、{problem.name}にチェックを入れてください。
                </p>
              ) : (
                <p>「記録」→「管理」から、試したことを登録できます。</p>
              )}
            </div>
          )}
          {(() => {
            const items = relevant.map((a) => ({ a, c: compareApproach(entries, pid, a.id, end, period) }));
            const ready = items.filter((x) => x.c.status !== 'impossible');
            const waiting = items.filter((x) => x.c.status === 'impossible');
            const card = ({ a, c }: (typeof items)[number]) => {
              const t = describeComparison(c, a.name);
              return (
                <article key={a.id} className="cmp">
                  <h3>{a.name}{a.archivedAt ? '（アーカイブ済み）' : ''}</h3>
                  <p><strong>{t.headline}</strong></p>
                  {t.lines.map((l, i) => <p key={i}>{l}</p>)}
                  {c.status !== 'impossible' && c.imbalance && (
                    <p className="warn">実施した日（{c.nDone}日）としなかった日（{c.nNotDone}日）の件数に大きな差があります。比較は慎重にご覧ください。</p>
                  )}
                  {(c.excludedUnknown > 0 || c.excludedNoRating > 0) && (
                    <p className="muted small">除外: 実施状況が未回答の日 {c.excludedUnknown}日、症状の評価がない日 {c.excludedNoRating}日。</p>
                  )}
                  {t.caution.length > 0 && (
                    <div className="caution">
                      <Buhio size={64} pose="important" />
                      <ul className="muted small">{t.caution.map((x) => <li key={x}>{x}</li>)}</ul>
                    </div>
                  )}
                </article>
              );
            };
            return (
              <>
                {ready.map(card)}
                {waiting.length > 0 && (
                  <details className="cmp">
                    <summary>まだ比較できない試したこと（{waiting.length}件）</summary>
                    {waiting.map(card)}
                  </details>
                )}
              </>
            );
          })()}
        </details>
      )}
    </div>
  );
}

/** 要因ごとの具体的な内容（押したときに開く）。数字より、文章で伝える。 */
function CandidateDetail({ c, problemName }: { c: Candidate; problemName: string }) {
  const n = buildNarrative(problemName, c);
  const d = c.detail;
  const a = d.type === 'binary' ? d.nA : d.nHigh, b = d.type === 'binary' ? d.nB : d.nLow;
  const small = Math.min(a, b);
  const unbalanced = small / (a + b) < 0.2 || Math.max(a, b) >= 3 * small;
  return (
    <div className="cdetail">
      <h4>数字で見ると</h4>
      {n.numbers.map((t) => <p key={t}>{t}</p>)}
      {unbalanced && <p className="warn">比べた2つの側の日数に大きな差があります。慎重にご覧ください。</p>}
      <h4>考えられる理由</h4>
      <ul className="reasons">{n.reasons.map((t) => <li key={t}>{t}</li>)}</ul>
      <h4>次にやってみること</h4>
      <p>{n.tip}</p>
      {n.note && <p className="muted small">{n.note}</p>}
      <p className="muted small">参考: 関連の強さ {c.rho > 0 ? '+' : ''}{c.rho.toFixed(2)}（{STRENGTH_LABEL[c.strength]}）</p>
    </div>
  );
}
