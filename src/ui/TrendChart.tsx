import type { Series } from '../domain/analytics';
import { formatJa } from '../domain/date';

const W = 320, H = 170, L = 26, R = 8, T = 10, B = 34;

/** 欠損日は線をつながず、下端に「×」で明示する */
export function TrendChart({ series, name }: { series: Series; name: string }) {
  const n = series.days.length;
  const x = (i: number) => L + (n === 1 ? 0 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + ((10 - v) * (H - T - B)) / 10;
  const segs: string[] = [];
  let cur: string[] = [];
  series.days.forEach((p, i) => {
    if (p.rating == null) { if (cur.length > 1) segs.push(cur.join(' ')); cur = []; }
    else cur.push(`${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`);
  });
  if (cur.length > 1) segs.push(cur.join(' '));
  const first = series.days[0].date, last = series.days[n - 1].date;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${name}の推移。${n}日間のうち${series.recorded}日分の記録、${series.missing}日は未記録。`}>
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={L - 4} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{v}</text>
          </g>
        ))}
        {segs.map((pts, i) => <polyline key={i} points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" />)}
        {series.days.map((p, i) =>
          p.rating == null ? (
            <text key={p.date} x={x(i)} y={H - B + 12} textAnchor="middle" fontSize="9" fill="var(--muted)">×</text>
          ) : (
            <circle key={p.date} cx={x(i)} cy={y(p.rating)} r={n > 30 ? 2.5 : 4} fill="var(--accent)" />
          ),
        )}
        <text x={L} y={H - 6} fontSize="10" fill="var(--muted)">{formatJa(first)}</text>
        <text x={W - R} y={H - 6} fontSize="10" textAnchor="end" fill="var(--muted)">{formatJa(last)}</text>
      </svg>
      <figcaption className="muted small">● 記録あり　× 未記録（線はつなぎません）。0＝なし、10＝最もつらい。</figcaption>
      <details>
        <summary>数値の一覧</summary>
        <table>
          <tbody>
            {series.days.map((p) => <tr key={p.date}><th scope="row">{formatJa(p.date)}</th><td>{p.rating ?? '未記録'}</td></tr>)}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
