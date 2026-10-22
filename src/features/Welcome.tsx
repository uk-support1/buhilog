import { useState } from 'react';
import type { Repo } from '../db/repo';
import { Buhio } from '../ui/Buhio';

const EXAMPLES = ['睡眠', '気分の落ち込み', '不安', '体のだるさ', '痛み'];

export function Welcome({ repo, onDone }: { repo: Repo; onDone: () => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [names, setNames] = useState<string[]>([]);
  const [custom, setCustom] = useState('');

  const finish = async () => {
    for (const n of names) await repo.addProblem(n);
    await repo.saveSettings({ onboardingCompleted: true });
    onDone();
  };
  const add = (n: string) => {
    const t = n.trim();
    if (t && !names.includes(t) && names.length < 5) setNames([...names, t]);
  };

  if (step === 0) {
    return (
      <main className="card welcome">
        <Buhio size={132} pose="wave" />
        <h1>ぶひろぐ</h1>
        <p>困りごとと、試したことを記録して、自分なりの傾向を見つけるためのアプリです。</p>
        <ul>
          <li>病気の診断や、薬・治療の判断はしません。</li>
          <li>見えるのは「記録した日どうしの関連」で、原因や効果を示すものではありません。</li>
          <li>記録はこの端末の中だけに保存され、外部へは送信されません。</li>
          <li>入力はすべて任意です。できない日があっても大丈夫です。</li>
        </ul>
        <button className="primary" onClick={() => setStep(1)}>はじめる</button>
      </main>
    );
  }
  return (
    <main className="card">
      <div className="center"><Buhio size={80} pose="think" /></div>
      <h1>気になっていることは？</h1>
      <p className="muted">1〜5個まで。あとから変更できます。後回しも可能です。</p>
      <div className="chips">
        {EXAMPLES.map((e) => (
          <button key={e} type="button" disabled={names.includes(e)} onClick={() => add(e)}>＋{e}</button>
        ))}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); add(custom); setCustom(''); }}>
        <input aria-label="自由入力" placeholder="自由に入力（例: 右肩の痛み）" maxLength={50} value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button type="submit">追加</button>
      </form>
      <ul>{names.map((n) => <li key={n}>{n} <button onClick={() => setNames(names.filter((x) => x !== n))}>外す</button></li>)}</ul>
      <button className="primary" onClick={finish}>{names.length ? '記録をはじめる' : '後で登録する'}</button>
    </main>
  );
}
