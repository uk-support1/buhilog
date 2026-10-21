import { useCallback, useEffect, useState } from 'react';
import type { Repo } from '../db/repo';
import { addDays, formatJa, toLocalDate } from '../domain/date';
import type { DailyEntry, Problem } from '../domain/types';

export function History({ repo, onEdit }: { repo: Repo; onEdit: (date: string) => void }) {
  const [entries, setEntries] = useState<Map<string, DailyEntry>>(new Map());
  const [problems, setProblems] = useState<Problem[]>([]);
  const reload = useCallback(async () => {
    setEntries(new Map((await repo.listEntries()).map((e) => [e.localDate, e])));
    setProblems(await repo.listProblems(true));
  }, [repo]);
  useEffect(() => { void reload(); }, [reload]);

  const today = toLocalDate();
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, -i));
  const older = [...entries.keys()].filter((k) => k < days[days.length - 1]).sort().reverse();

  const summary = (e: DailyEntry) =>
    problems
      .filter((p) => p.id in e.problemRatings)
      .map((p) => `${p.name}: ${e.problemRatings[p.id] ?? '未入力'}`)
      .join(' / ') || '（評価の入力なし）';

  const row = (d: string) => {
    const e = entries.get(d);
    return (
      <li key={d} className="row wrap">
        <span className="grow">
          <strong>{formatJa(d)}</strong>
          <br />
          <small className={e ? '' : 'muted'}>{e ? summary(e) : '未記録'}</small>
        </span>
        <button onClick={() => onEdit(d)}>{e ? '編集' : '記録する'}</button>
        {e && (
          <button onClick={async () => { if (confirm(`${formatJa(d)}の記録を削除します。元に戻せません。よろしいですか？`)) { await repo.deleteEntry(d); await reload(); } }}>
            削除
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="card">
      <h2>記録の履歴</h2>
      <p className="muted small">「未記録」は 0 点ではありません。</p>
      <ul className="plain">{days.map(row)}{older.map(row)}</ul>
    </section>
  );
}
