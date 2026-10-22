import { useEffect, useMemo, useState } from 'react';
import type { Repo } from '../db/repo';
import { buildSeries, compareApproach, PERIODS, type Period } from '../domain/analytics';
import { toLocalDate } from '../domain/date';
import { describeComparison } from '../domain/text';
import type { Approach, DailyEntry, Problem } from '../domain/types';
import { Buhio } from '../ui/Buhio';
import { TrendChart } from '../ui/TrendChart';

export function Review({ repo }: { repo: Repo }) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [approaches, setApproaches] = useState<Approach[]>([]);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [pid, setPid] = useState<string>('');
  const [period, setPeriod] = useState<Period>(28);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const [ps, as, es] = await Promise.all([repo.listProblems(true), repo.listApproaches(true), repo.listEntries()]);
      setProblems(ps); setApproaches(as); setEntries(es);
      setPid((cur) => cur || ps.find((p) => !p.archivedAt)?.id || ps[0]?.id || '');
      setLoaded(true);
    })();
  }, [repo]);

  const end = toLocalDate();
  const series = useMemo(() => (pid ? buildSeries(entries, pid, end, period) : null), [entries, pid, end, period]);
  const problem = problems.find((p) => p.id === pid);

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
            {problems.map((p) => <option key={p.id} value={p.id}>{p.name}{p.archivedAt ? '（アーカイブ済み）' : ''}</option>)}
          </select>
        </label>
        <div className="seg" role="radiogroup" aria-label="期間">
          {PERIODS.map((d) => (
            <button key={d} role="radio" aria-checked={period === d} className={period === d ? 'sel' : ''} onClick={() => setPeriod(d)}>直近{d}日</button>
          ))}
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

      {problem && (
        <section className="card">
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
          {relevant.map((a) => {
            const c = compareApproach(entries, pid, a.id, end, period);
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
          })}
        </section>
      )}
    </div>
  );
}
