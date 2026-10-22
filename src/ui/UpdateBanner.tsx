import { useRegisterSW } from 'virtual:pwa-register/react';

/** Service Worker の登録（オフライン動作）と、新版が出たときの案内 */
export function UpdateBanner() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="card warn" role="status">
      {needRefresh ? (
        <>
          新しいバージョンがあります。記録は消えません。
          <button onClick={() => void updateServiceWorker(true)}>更新する</button>
          <button onClick={() => setNeedRefresh(false)}>あとで</button>
        </>
      ) : (
        <>
          オフラインでも使えるようになりました。
          <button onClick={() => setOfflineReady(false)}>閉じる</button>
        </>
      )}
    </div>
  );
}
