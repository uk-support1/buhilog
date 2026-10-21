import { useEffect, useState } from 'react';
import { backupDue } from '../db/backup';
import type { Repo } from '../db/repo';

/** 責めない文面で、バックアップ時期を知らせる */
export function BackupReminder({ repo, onGo }: { repo: Repo; onGo: () => void }) {
  const [due, setDue] = useState(false);
  useEffect(() => {
    void (async () => {
      const [s, es] = await Promise.all([repo.getSettings(), repo.listEntries()]);
      setDue(backupDue(es.length > 0, s));
    })();
  }, [repo]);
  if (!due) return null;
  return (
    <div className="card warn" role="status">
      記録を安全に残すため、バックアップを保存しませんか？（端末のデータが消えても復元できます）
      <button onClick={onGo}>設定を開く</button>
    </div>
  );
}
