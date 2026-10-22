import { useEffect, useMemo, useState } from 'react';
import type { Repo } from '../db/repo';
import { buildSeries, compareApproach, PERIODS, type Period } from '../domain/analytics';
import { toLocalDate } from '../domain/date';
import { buildGroups, hasNamedGroups } from '../domain/groups';
import { candidateSentence, EVIDENCE_LABEL, rankFactors, STRENGTH_LABEL, type Candidate } from '../domain/correlation';
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
                        <strong>{c.name}</strong>
                        <small className="muted"> {c.group}</small>
                        <span className="csent">{c.positive ? '＋ ' : '－ '}{candidateSentence(c)}</span>
                        <span className="badges">
                          <span className={`badge ev-${c.evidence}`}>{EVIDENCE_LABEL[c.evidence]}</span>
                          <span className="badge">関連の強さ: {STRENGTH_LABEL[c.strength]}</span>
                          <span className="badge">{c.n}日分</span>
                        </span>
                      </span>
                      <span className="chev" aria-hidden="true">{openKey === c.key ? '▲' : '▼'}</span>
                    </button>
                    {openKey === c.key && <CandidateDetail c={c} />}
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

const f1 = (n: number) => n.toFixed(1);
const clockText = (v: number) => { const h = Math.floor(v) % 24; const m = Math.round((v - Math.floor(v)) * 60); return `${h}:${String(m).padStart(2, '0')}`; };

/** 要因ごとの具体的な内容（押したときに開く） */
function CandidateDetail({ c }: { c: Candidate }) {
  const d = c.detail;
  const total = d.type === 'binary' ? d.nA + d.nB : d.nLow + d.nHigh;
  const small = d.type === 'binary' ? Math.min(d.nA, d.nB) : Math.min(d.nLow, d.nHigh);
  const unbalanced = small / total < 0.2 || (Math.max(d.type === 'binary' ? d.nA : d.nLow, d.type === 'binary' ? d.nB : d.nHigh) >= 3 * small);
  const cutText = c.key === 's:bed' || c.key === 's:wake' ? clockText(d.type === 'numeric' ? d.cut : 0) : d.type === 'numeric' ? String(Math.round(d.cut * 100) / 100) : '';
  return (
    <div className="cdetail">
      {d.type === 'binary' ? (
        <>
          <p>実施した日：調子の平均 <strong>{f1(d.meanA)}</strong>（{d.nA}日）</p>
          <p>実施しなかった日：調子の平均 <strong>{f1(d.meanB)}</strong>（{d.nB}日）</p>
          <p>差（実施した日 − しなかった日）：{d.meanA - d.meanB > 0 ? '+' : ''}{f1(d.meanA - d.meanB)} ポイント（点数は大きいほど調子が良い）</p>
        </>
      ) : (
        <>
          <p>{c.name}が「{cutText}」より{c.more}日：調子の平均 <strong>{f1(d.meanHigh)}</strong>（{d.nHigh}日）</p>
          <p>それ以外の日：調子の平均 <strong>{f1(d.meanLow)}</strong>（{d.nLow}日）</p>
          <p>差：{d.meanHigh - d.meanLow > 0 ? '+' : ''}{f1(d.meanHigh - d.meanLow)} ポイント（点数は大きいほど調子が良い）</p>
        </>
      )}
      <p className="muted small">関連の強さ（−1〜＋1）：{c.rho > 0 ? '+' : ''}{c.rho.toFixed(2)}（{STRENGTH_LABEL[c.strength]}）／ 比べた日数：{c.n}日</p>
      {unbalanced && <p className="warn">比べた2つの側の日数に大きな差があります。慎重にご覧ください。</p>}
      <ul className="muted small">
        <li>同じ日の記録どうしの関連で、原因や効果を示すものではありません。</li>
        <li>調子が悪い日に、その行動をする（しない）という逆の関係も考えられます。</li>
        <li>睡眠や活動など、ほかの要因も重なっている可能性があります。</li>
      </ul>
    </div>
  );
}
