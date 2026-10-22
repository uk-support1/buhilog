import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Repo } from '../db/repo';
import { addDays, formatJa, toLocalDate } from '../domain/date';
import { buildGroups } from '../domain/groups';
import { groupProgress, shortGroupName } from '../domain/progress';
import type { Approach, DailyEntry, Problem } from '../domain/types';

const PAGE_DAYS = 14;

export function History({ repo, onEdit }: { repo: Repo; onEdit: (date: string) => void }) {
  const [entries, setEntries] = useState<Map<string, DailyEntry>>(new Map());
  const [problems, setProblems] = useState<Problem[]>([]);
  const [approaches, setApproaches] = useState<Approach[]>([]);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [shown, setShown] = useState(PAGE_DAYS);
  const reload = useCallback(async () => {
    setEntries(new Map((await repo.listEntries()).map((e) => [e.localDate, e])));
    setProblems(await repo.listProblems());
    setApproaches(await repo.listApproaches());
    setGroupOrder((await repo.getSettings()).groupOrder ?? []);
  }, [repo]);
  useEffect(() => { void reload(); }, [reload]);

  const groups = useMemo(() => buildGroups(problems, approaches, groupOrder), [problems, approaches, groupOrder]);
  const today = toLocalDate();
  // 直近 shown 日分を表示し、「さらに過去を見る」で14日ずつ増やす（記録のある最古の日まで）
  const earliest = [...entries.keys()].sort()[0];
  const days = Array.from({ length: shown }, (_, i) => addDays(today, -i));
  const hasMore = !!earliest && earliest < days[days.length - 1];

  const row = (d: string) => {
    const e = entries.get(d);
    const prog = e ? groupProgress(e, groups) : [];
    return (
      <li key={d} className={`hrow${e ? '' : ' empty'}`}>
        <div className="hmain">
          <strong>{formatJa(d)}</strong>
          {e ? (
            <div className="hchips" aria-label="入力済みの件数">
              {prog.length === 0 && <span className="muted small">（評価の入力なし）</span>}
              {prog.map((p) => (
                <span key={p.name} className={`hchip ${p.filled === p.total ? 'full' : p.filled === 0 ? 'none' : ''}`}>
                  {shortGroupName(p.name)} {p.filled}/{p.total}
                </span>
              ))}
              {e.note && <span className="hchip memo">メモあり</span>}
            </div>
          ) : (
            <div className="muted small">未記録</div>
          )}
        </div>
        <div className="hbtn">
          <button onClick={() => onEdit(d)}>{e ? '編集' : '記録する'}</button>
          {e && (
            <button onClick={async () => { if (confirm(`${formatJa(d)}の記録を削除します。元に戻せません。よろしいですか？`)) { await repo.deleteEntry(d); await reload(); } }}>
              削除
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <section className="card">
      <h2>記録の履歴</h2>
      <p className="muted small">大分類ごとの「入力した数/全体」を表示しています。「未記録」は 0 点ではありません。</p>
      <ul className="plain">{days.map(row)}</ul>
      {hasMore && <button className="more" onClick={() => setShown((n) => n + PAGE_DAYS)}>さらに過去を見る（{PAGE_DAYS}日分）</button>}
    </section>
  );
}
