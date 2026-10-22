import { useRegisterSW } from 'virtual:pwa-register/react';

/** Service Worker の登録（オフライン動作）と、新版が出たときの案内 */
export function UpdateBanner() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // アプリを開き直したとき・画面に戻ったときに、新しい版がないか確認する
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => { if (document.visibilityState === 'visible') void registration.update().catch(() => undefined); };
      document.addEventListener('visibilitychange', check);
      check();
    },
  });
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
