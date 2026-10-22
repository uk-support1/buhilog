import { useState } from 'react';

/** 今の画面の版を表示し、最新版の確認・再読み込みができる（記録データには触れない） */
export function VersionInfo() {
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch { /* オフライン時などは再読み込みだけ行う */ }
    location.reload();
  };
  return (
    <section className="card" aria-labelledby="ver-h">
      <h2 id="ver-h">アプリの版</h2>
      <p className="muted small">{__BUILD__}</p>
      <button onClick={refresh} disabled={busy}>最新版を確認して再読み込み</button>
      <p className="muted small">記録データは消えません。</p>
    </section>
  );
}
