import { useEffect, useState } from 'react';
import { repo } from './db/repo';
import { Today } from './features/Today';
import { Manage } from './features/Manage';
import { History } from './features/History';
import { Settings } from './features/Settings';
import { Welcome } from './features/Welcome';
import { Buhio } from './ui/Buhio';

type Tab = 'record' | 'review' | 'settings';
type Sub = 'today' | 'history' | 'manage';

export function App() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [tab, setTab] = useState<Tab>('record');
  const [sub, setSub] = useState<Sub>('today');
  const [editDate, setEditDate] = useState<string | undefined>();
  const [key, setKey] = useState(0);

  useEffect(() => {
    void repo.getSettings().then((s) => { setOnboarded(s.onboardingCompleted); setReady(true); });
  }, []);

  if (!ready) return null;
  if (!onboarded) return <Welcome repo={repo} onDone={() => setOnboarded(true)} />;

  return (
    <div className="app">
      <header><Buhio size={32} /><span>ぶひろぐ</span></header>
      <main>
        {tab === 'record' && (
          <>
            <nav className="subnav" aria-label="記録メニュー">
              {([['today', '今日'], ['history', '履歴'], ['manage', '管理']] as [Sub, string][]).map(([s, l]) => (
                <button key={s} className={sub === s ? 'sel' : ''} onClick={() => { setSub(s); if (s === 'today') setEditDate(undefined); setKey((k) => k + 1); }}>{l}</button>
              ))}
            </nav>
            {sub === 'today' && <Today key={`${key}-${editDate ?? ''}`} repo={repo} initialDate={editDate} />}
            {sub === 'history' && <History repo={repo} onEdit={(d) => { setEditDate(d); setSub('today'); }} />}
            {sub === 'manage' && <Manage repo={repo} />}
          </>
        )}
        {tab === 'review' && <section className="card"><h2>ふりかえり</h2><p>準備中です。</p></section>}
        {tab === 'settings' && <Settings repo={repo} onWiped={() => { setOnboarded(false); setTab('record'); setSub('today'); }} />}
      </main>
      <nav className="tabs" aria-label="メインメニュー">
        {([['record', '記録'], ['review', 'ふりかえり'], ['settings', '設定']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} className={tab === t ? 'sel' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{l}</button>
        ))}
      </nav>
    </div>
  );
}
