import { useEffect, useState } from 'react';
import type { Repo } from '../db/repo';
import { formatJa, isValidLocalDate, toLocalDate } from '../domain/date';
import type { Approach, ApproachStatus, Problem } from '../domain/types';
import { Buhio } from '../ui/Buhio';
import { RatingInput } from '../ui/RatingInput';

interface Form {
  ratings: Record<string, number | null>;
  notes: Record<string, string>;
  statuses: Record<string, ApproachStatus>;
  sleep: string;
  stress: number | null;
  note: string;
}
const emptyForm = (): Form => ({ ratings: {}, notes: {}, statuses: {}, sleep: '', stress: null, note: '' });

const STATUS_LABEL: Record<ApproachStatus, string> = { done: '実施した', not_done: '実施しなかった', unknown: '未回答' };

export function Today({ repo, initialDate }: { repo: Repo; initialDate?: string }) {
  // 日付は入力開始時（画面を開いた時点）に確定し、保存前に変更できる
  const [date, setDate] = useState(initialDate ?? toLocalDate());
  const [problems, setProblems] = useState<Problem[]>([]);
  const [approaches, setApproaches] = useState<Approach[]>([]);
  const [form, setForm] = useState<Form>(emptyForm());
  const [existing, setExisting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const [ps, as, e] = await Promise.all([repo.listProblems(), repo.listApproaches(), repo.getEntry(date)]);
      if (!live) return;
      setProblems(ps);
      setApproaches(as);
      setExisting(!!e);
      setForm(
        e
          ? {
              ratings: { ...e.problemRatings },
              notes: { ...e.problemNotes },
              statuses: { ...e.approachStatuses },
              sleep: e.sleepHours != null ? String(e.sleepHours) : '',
              stress: e.stressRating ?? null,
              note: e.note ?? '',
            }
          : emptyForm(),
      );
      setDirty(false);
      setMsg('');
      setErr('');
    })();
    return () => { live = false; };
  }, [repo, date]);

  const edit = (f: (x: Form) => Form) => { setForm(f); setDirty(true); setMsg(''); };

  const changeDate = (v: string) => {
    if (!isValidLocalDate(v)) return;
    if (dirty && !confirm('保存していない入力があります。日付を変えると破棄されます。よろしいですか？')) return;
    setDate(v);
  };

  const save = async () => {
    setErr('');
    const sleepNum = form.sleep.trim() === '' ? undefined : Number(form.sleep);
    if (sleepNum !== undefined && (Number.isNaN(sleepNum) || sleepNum < 0 || sleepNum > 24)) {
      setErr('睡眠時間は0〜24の数字で入力してください。');
      return;
    }
    try {
      await repo.saveEntry({
        localDate: date,
        problemRatings: form.ratings,
        problemNotes: Object.fromEntries(Object.entries(form.notes).filter(([, v]) => v.trim() !== '')),
        approachStatuses: form.statuses,
        sleepHours: sleepNum,
        stressRating: form.stress ?? undefined,
        note: form.note.trim() === '' ? undefined : form.note,
      });
      setExisting(true);
      setDirty(false);
      setMsg(`${formatJa(date)}の記録を保存しました。あとから直せます。`);
    } catch {
      setErr('保存できませんでした。入力内容を確認してください。');
    }
  };

  return (
    <div>
      <section className="card">
        <label className="field">
          記録する日
          <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
        </label>
        <p className="muted">
          {formatJa(date)}{existing ? '（記録あり・編集中）' : '（まだ記録がありません）'}。入力は全部任意です。無理のない範囲で。
        </p>
      </section>

      {problems.length === 0 && (
        <p className="card"><Buhio size={64} pose="pointing" /> 先に「管理」から困りごとを登録してください。</p>
      )}

      {problems.map((p) => (
        <section className="card" key={p.id} aria-label={p.name}>
          <h2>{p.name}</h2>
          <p className="muted small">0＝なし 〜 10＝最もつらい</p>
          <RatingInput
            label={`${p.name}の強さ`}
            value={form.ratings[p.id]}
            onChange={(v) => edit((f) => ({ ...f, ratings: { ...f.ratings, [p.id]: v } }))}
          />
          <label className="field">
            メモ（任意）
            <textarea
              rows={2}
              maxLength={2000}
              value={form.notes[p.id] ?? ''}
              onChange={(e) => edit((f) => ({ ...f, notes: { ...f.notes, [p.id]: e.target.value } }))}
            />
          </label>
        </section>
      ))}

      {approaches.length > 0 && (
        <section className="card">
          <h2>試したこと</h2>
          <p className="muted small">「実施しなかった」と「未回答」は別のものとして扱います。</p>
          {approaches.map((a) => (
            <div key={a.id} role="radiogroup" aria-label={a.name} className="approach-row">
              <div className="name">{a.name}</div>
              <div className="seg">
                {(['done', 'not_done', 'unknown'] as ApproachStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={(form.statuses[a.id] ?? 'unknown') === s}
                    className={(form.statuses[a.id] ?? 'unknown') === s ? 'sel' : ''}
                    onClick={() => edit((f) => ({ ...f, statuses: { ...f.statuses, [a.id]: s } }))}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>からだと気持ち（任意）</h2>
        <label className="field">
          睡眠時間（時間）
          <input
            inputMode="decimal"
            placeholder="例: 6.5"
            value={form.sleep}
            onChange={(e) => edit((f) => ({ ...f, sleep: e.target.value }))}
          />
        </label>
        <div className="field">
          ストレス（0〜10）
          <RatingInput label="ストレス" value={form.stress} onChange={(v) => edit((f) => ({ ...f, stress: v }))} />
        </div>
        <label className="field">
          自由メモ
          <textarea rows={3} maxLength={2000} value={form.note} onChange={(e) => edit((f) => ({ ...f, note: e.target.value }))} />
        </label>
      </section>

      {err && <p role="alert" className="err">{err}</p>}
      {msg && (
        <div role="status" className="ok saved">
          <Buhio size={64} pose="jumping" />
          <span>{msg}</span>
        </div>
      )}
      <button className="primary" onClick={save} disabled={problems.length === 0}>
        保存する{dirty ? '（未保存の変更あり）' : ''}
      </button>
    </div>
  );
}
