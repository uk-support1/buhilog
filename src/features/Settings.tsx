import { useEffect, useState } from 'react';
import type { Repo } from '../db/repo';
import { BackupPanel } from './BackupPanel';
import { SharedDeviceNotice, SupportInfo } from '../ui/Support';

export function Settings({ repo, onWiped, onRestored }: { repo: Repo; onWiped: () => void; onRestored: () => void }) {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        if (navigator.storage?.persist) setPersisted(await navigator.storage.persist());
      } catch { setPersisted(null); }
    })();
  }, []);

  const wipe = async () => {
    if (!confirm('すべての記録と設定を、この端末から削除します。元に戻せません。続けますか？')) return;
    if (!confirm('本当に削除しますか？ バックアップがない場合、記録は完全に失われます。')) return;
    await repo.wipeAll();
    onWiped();
  };

  return (
    <div>
      <SupportInfo />
      <SharedDeviceNotice />
      <BackupPanel repo={repo} onRestored={onRestored} />
      <section className="card">
        <h2>保存の状態</h2>
        <p>
          {persisted === true && 'ブラウザに「消さないで」と依頼済みです。'}
          {persisted === false && 'ブラウザが保存を保証していません。ホーム画面に追加して使い、バックアップを取ってください。'}
          {persisted === null && '保存状態を確認できませんでした。バックアップを取ってください。'}
        </p>
      </section>
      <section className="card">
        <h2>すべてのデータを削除</h2>
        <button className="danger" onClick={wipe}>全データを削除する</button>
      </section>
    </div>
  );
}
