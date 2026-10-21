import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { buildBackup, buildCsv, daysSince, parseBackup, restoreBackup, type ParseResult } from '../db/backup';
import type { Repo } from '../db/repo';
import { saveFile } from '../ui/download';
import { toLocalDate } from '../domain/date';

export function BackupPanel({ repo, onRestored }: { repo: Repo; onRestored: () => void }) {
  const [last, setLast] = useState<number | undefined>();
  const [msg, setMsg] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);

  const load = () => repo.getSettings().then((s) => setLast(s.lastBackupAt));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const exportJson = async () => {
    const b = await buildBackup(repo);
    if (await saveFile(`buhilog-backup-${toLocalDate()}.json`, JSON.stringify(b, null, 2), 'application/json')) {
      await repo.saveSettings({ lastBackupAt: Date.now() });
      await load();
      setMsg('バックアップを保存しました。保存先を確認してください。');
    }
  };
  const exportCsv = async () => {
    await saveFile(`buhilog-${toLocalDate()}.csv`, buildCsv(await buildBackup(repo)), 'text/csv');
  };
  const pick = async (f: File | undefined) => {
    setMsg('');
    if (!f) return;
    setParsed(parseBackup(await f.text()));
  };
  const restore = async () => {
    if (!parsed?.ok) return;
    const { summary } = parsed;
    if (!confirm(`現在のデータをすべて、バックアップ（記録${summary.dailyEntries}日分）の内容で置き換えます。続けますか？`)) return;
    if (!confirm('本当に置き換えますか？ 現在のデータは、直前に自動で保存するファイルにのみ残ります。')) return;
    const current = await buildBackup(repo);
    if (current.dailyEntries.length + current.problems.length > 0) {
      const ok = await saveFile(`buhilog-before-restore-${toLocalDate()}.json`, JSON.stringify(current, null, 2), 'application/json');
      if (!ok) { setMsg('現在のデータの保存が完了しなかったため、復元を中止しました。'); return; }
    }
    try {
      await restoreBackup(db, parsed.backup);
      setParsed(null);
      setMsg('復元しました。');
      onRestored();
    } catch {
      setMsg('復元に失敗しました。現在のデータは変更されていません。');
    }
  };

  const d = daysSince(last);
  return (
    <section className="card" aria-labelledby="bk-h">
      <h2 id="bk-h">バックアップと復元</h2>
      <p>最後のバックアップ：{d == null ? 'まだありません' : d === 0 ? '今日' : `${d}日前`}</p>
      <p className="muted small">端末やブラウザのデータが消えると記録も失われます。定期的に保存してください。</p>
      <button className="primary" onClick={exportJson}>バックアップを保存（JSON）</button>
      <button onClick={exportCsv}>CSVで書き出す</button>
      <h3>復元</h3>
      <label className="field">
        バックアップファイルを選ぶ
        <input type="file" accept="application/json,.json" onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {parsed && !parsed.ok && (
        <div role="alert" className="err"><p>復元できません。現在のデータは変更されていません。</p><ul>{parsed.errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
      )}
      {parsed?.ok && (
        <div>
          <p>
            読み込み内容：困りごと{parsed.summary.problems}件、アプローチ{parsed.summary.approaches}件、記録{parsed.summary.dailyEntries}日分
            （作成: {parsed.summary.exportedAt.slice(0, 10)}）
          </p>
          <button className="danger" onClick={restore}>この内容で置き換える</button>
        </div>
      )}
      {msg && <p role="status" className="ok">{msg}</p>}
    </section>
  );
}
