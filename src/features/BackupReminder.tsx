import { useEffect, useState } from 'react';
import { backupDue } from '../db/backup';
import type { Repo } from '../db/repo';

const SNOOZE_DAYS = 3;

/** 責めない文面で、バックアップ時期を知らせる。「あとで」で数日間は出さない。画面（タブ）を切り替えるたびに状態を見直す。 */
export function BackupReminder({ repo, onGo }: { repo: Repo; onGo: () => void }) {
  const [due, setDue] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      const [s, es] = await Promise.all([repo.getSettings(), repo.listEntries()]);
      if (live) setDue(backupDue(es.length > 0, s));
    })();
    return () => { live = false; };
  }, [repo]);
  if (!due) return null;
  return (
    <div className="card warn" role="status">
      記録を安全に残すため、バックアップを保存しませんか？（端末のデータが消えても復元できます）
      <div className="row wrap">
        <button onClick={onGo}>設定を開く</button>
        <button
          onClick={async () => {
            await repo.saveSettings({ backupSnoozedUntil: Date.now() + SNOOZE_DAYS * 86_400_000 });
            setDue(false);
          }}
        >
          あとで（{SNOOZE_DAYS}日間）
        </button>
      </div>
    </div>
  );
}
