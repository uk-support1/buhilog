import { useEffect, useMemo, useState } from 'react';
import type { Repo } from '../db/repo';
import { formatJa, isValidLocalDate, toLocalDate } from '../domain/date';
import { buildGroups, hasNamedGroups } from '../domain/groups';
import { AWAKE_COUNTED, AWAKE_LABELS, awakeningTotal, totalSleepHours, nightHours } from '../domain/sleep';
import type { Approach, ApproachStatus, Problem } from '../domain/types';
import { Buhio } from '../ui/Buhio';
import { PROBLEM_SCALE_LABEL } from '../domain/scale';
import { RatingInput } from '../ui/RatingInput';
import { ScoreInput } from '../ui/ScoreInput';

interface Form {
  ratings: Record<string, number | null>;
  notes: Record<string, string>;
  statuses: Record<string, ApproachStatus>;
  sleep: string;
  bed: string;
  wake: string;
  nap: string;
  awake: string[];
  stress: number | null;
  note: string;
}
const emptyForm = (): Form => ({ ratings: {}, notes: {}, statuses: {}, sleep: '', bed: '', wake: '', nap: '', awake: Array(6).fill(''), stress: null, note: '' });

const STATUS_LABEL: Record<ApproachStatus, string> = { done: '実施した', not_done: '実施しなかった', unknown: '未回答' };
const MEMO_TAB = '__memo__';

export function Today({ repo, initialDate }: { repo: Repo; initialDate?: string }) {
  // 日付は入力開始時（画面を開いた時点）に確定し、保存前に変更できる
  const [date, setDate] = useState(initialDate ?? toLocalDate());
  const [problems, setProblems] = useState<Problem[]>([]);
  const [approaches, setApproaches] = useState<Approach[]>([]);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [form, setForm] = useState<Form>(emptyForm());
  const [existing, setExisting] = useState(false);
  const [dirty, setDirty] = useState(false);
  // かんたん記録（グループ未設定のとき）: メモ・睡眠・ストレスは折りたたむ。入力がある日は最初から開く
  const [detail, setDetail] = useState(false);
  const [tab, setTab] = useState<string>('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const [ps, as, e, st] = await Promise.all([repo.listProblems(), repo.listApproaches(), repo.getEntry(date), repo.getSettings()]);
      if (!live) return;
      setProblems(ps);
      setApproaches(as);
      setGroupOrder(st.groupOrder ?? []);
      setExisting(!!e);
      setForm(
        e
          ? {
              ratings: { ...e.problemRatings },
              notes: { ...e.problemNotes },
              statuses: { ...e.approachStatuses },
              sleep: e.sleepHours != null ? String(e.sleepHours) : '',
              bed: e.bedtime ?? '',
              wake: e.wakeTime ?? '',
              nap: e.napHours != null ? String(e.napHours) : '',
              awake: Array.from({ length: 6 }, (_, i) => (e.awakenings?.[i] != null ? String(e.awakenings[i]) : '')),
              stress: e.stressRating ?? null,
              note: e.note ?? '',
            }
          : emptyForm(),
      );
      setDirty(false);
      setDetail(!!e && (Object.values(e.problemNotes).some(Boolean) || e.sleepHours != null || e.bedtime != null || e.wakeTime != null || e.napHours != null || !!e.awakenings || e.stressRating != null || !!e.note));
      setMsg('');
      setErr('');
    })();
    return () => { live = false; };
  }, [repo, date]);

  const groups = useMemo(() => buildGroups(problems, approaches, groupOrder), [problems, approaches, groupOrder]);
  const grouped = hasNamedGroups(groups);
  const activeTab = grouped ? (tab === MEMO_TAB || groups.some((g) => g.name === tab) ? tab : groups[0].name) : '';

  const edit = (f: (x: Form) => Form) => { setForm(f); setDirty(true); setMsg(''); };

  const changeDate = (v: string) => {
    if (!isValidLocalDate(v)) return;
    if (dirty && !confirm('保存していない入力があります。日付を変えると破棄されます。よろしいですか？')) return;
    setDate(v);
  };

  const save = async () => {
    setErr('');
    const manualSleep = form.sleep.trim() === '' ? undefined : Number(form.sleep);
    if (manualSleep !== undefined && (Number.isNaN(manualSleep) || manualSleep < 0 || manualSleep > 24)) {
      setErr('睡眠時間は0〜24の数字で入力してください。');
      return;
    }
    const napNum = form.nap.trim() === '' ? undefined : Number(form.nap);
    if (napNum !== undefined && (Number.isNaN(napNum) || napNum < 0 || napNum > 24)) {
      setErr('昼寝の時間は0〜24の数字で入力してください。');
      return;
    }
    // 就寝・起床が揃っていれば、合計睡眠時間（夜＋昼寝）を自動計算して保存する
    const autoSleep = totalSleepHours(form.bed || undefined, form.wake || undefined, napNum);
    const sleepNum = autoSleep ?? manualSleep;
    const awakenings = form.awake.some((x) => x !== '') ? form.awake.map((x) => (x === '' ? null : Number(x))) : undefined;
    try {
      await repo.saveEntry({
        localDate: date,
        problemRatings: form.ratings,
        problemNotes: Object.fromEntries(Object.entries(form.notes).filter(([, v]) => v.trim() !== '')),
        approachStatuses: form.statuses,
        sleepHours: sleepNum,
        bedtime: form.bed || undefined,
        wakeTime: form.wake || undefined,
        napHours: napNum,
        awakenings,
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

  // 描画のたびに別コンポーネントにならないよう、関数として呼び出す（入力中のフォーカスを保つため）
  const problemBlock = (p: Problem, H: 'h2' | 'h3') => (
    <div className="item" aria-label={p.name} key={p.id}>
      <H>{p.name}</H>
      {p.description && <p className="muted small">{p.description}</p>}
      <ScoreInput
        label={`${p.name}の調子`}
        value={form.ratings[p.id]}
        onChange={(v) => edit((f) => ({ ...f, ratings: { ...f.ratings, [p.id]: v } }))}
      />
      {(detail || grouped) && (
        <details open={!!form.notes[p.id]}>
          <summary className="small">メモ</summary>
          <textarea
            aria-label={`${p.name}のメモ`}
            rows={2}
            maxLength={2000}
            value={form.notes[p.id] ?? ''}
            onChange={(e) => edit((f) => ({ ...f, notes: { ...f.notes, [p.id]: e.target.value } }))}
          />
        </details>
      )}
    </div>
  );

  const approachBlock = (a: Approach) => (
    <div role="radiogroup" aria-label={a.name} className="approach-row" key={a.id}>
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
  );

  const napNumber = form.nap.trim() === '' || Number.isNaN(Number(form.nap)) ? undefined : Number(form.nap);
  const night = nightHours(form.bed || undefined, form.wake || undefined);
  const autoTotal = totalSleepHours(form.bed || undefined, form.wake || undefined, napNumber);
  const awakeNums = form.awake.map((x) => (x === '' ? null : Number(x)));
  const awakeSum = awakeningTotal(awakeNums);
  const fmtH = (h: number) => `${Math.round(h * 100) / 100}`;

  const sleepCard = (
    <section className="card" aria-label="睡眠">
      <h2>睡眠</h2>
      <div className="two">
        <label className="field">
          就寝時刻
          <input type="time" value={form.bed} onChange={(e) => edit((f) => ({ ...f, bed: e.target.value }))} />
        </label>
        <label className="field">
          起床時刻
          <input type="time" value={form.wake} onChange={(e) => edit((f) => ({ ...f, wake: e.target.value }))} />
        </label>
      </div>
      <label className="field">
        昼寝（時間）
        <input inputMode="decimal" placeholder="例: 1 または 0.5" value={form.nap} onChange={(e) => edit((f) => ({ ...f, nap: e.target.value }))} />
      </label>
      {autoTotal != null ? (
        <p className="total" role="status">
          合計睡眠時間（自動）： <strong>{fmtH(autoTotal)} 時間</strong>
          <small className="muted"> 夜 {fmtH(night ?? 0)}{napNumber ? ` ＋ 昼寝 ${fmtH(napNumber)}` : ''}</small>
        </p>
      ) : (
        <label className="field">
          睡眠時間（時間）※就寝・起床を入れると自動で計算します
          <input inputMode="decimal" placeholder="例: 6.5" value={form.sleep} onChange={(e) => edit((f) => ({ ...f, sleep: e.target.value }))} />
        </label>
      )}
      <fieldset>
        <legend>中途覚醒の回数（眠ってからの時間ごと）</legend>
        <div className="awake-grid">
          {AWAKE_LABELS.map((label, i) => (
            <label key={label} className="field">
              {label}{i >= AWAKE_COUNTED ? '（合計に含めない）' : ''}
              <select value={form.awake[i]} onChange={(e) => edit((f) => ({ ...f, awake: f.awake.map((x, j) => (j === i ? e.target.value : x)) }))}>
                <option value="">未入力</option>
                {Array.from({ length: 10 }, (_, n) => <option key={n} value={String(n)}>{n}回</option>)}
              </select>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => edit((f) => ({ ...f, awake: Array(6).fill('0') }))}>中途覚醒なし（すべて0回）</button>
        <p className="total" role="status">合計（1〜6時間目）： <strong>{awakeSum == null ? '未入力' : `${awakeSum}回`}</strong></p>
      </fieldset>
    </section>
  );

  const sleepInTab = grouped && groups.some((g) => g.name === '睡眠');

  const bodySection = (
    <section className="card">
      <h2>{sleepInTab ? 'ストレスとメモ（任意）' : '睡眠とメモ（任意）'}</h2>
      <div className="field">
        ストレス（0〜10）
        <RatingInput label="ストレス" value={form.stress} onChange={(v) => edit((f) => ({ ...f, stress: v }))} />
      </div>
      <label className="field">
        自由メモ
        <textarea rows={grouped ? 8 : 3} maxLength={2000} value={form.note} onChange={(e) => edit((f) => ({ ...f, note: e.target.value }))} />
      </label>
      {!grouped && <button type="button" onClick={() => setDetail(false)}>くわしい入力をたたむ</button>}
    </section>
  );
  const bodyWithSleep = (
    <>
      {!sleepInTab && sleepCard}
      {bodySection}
    </>
  );

  const progress = (g: (typeof groups)[number]) => {
    const ps = g.sections.flatMap((s) => s.problems);
    const as = g.sections.flatMap((s) => s.approaches);
    let filled = ps.filter((p) => form.ratings[p.id] != null).length + as.filter((a) => (form.statuses[a.id] ?? 'unknown') !== 'unknown').length;
    let total = ps.length + as.length;
    if (g.name === '睡眠') {
      // 睡眠タブの入力欄（就寝・起床・中途覚醒）も数える。昼寝は「しない日」が多いので数えない
      total += 3;
      filled += (form.bed ? 1 : 0) + (form.wake ? 1 : 0) + (form.awake.some((x) => x !== '') ? 1 : 0);
    }
    return `${filled}/${total}`;
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

      {grouped ? (
        <>
          <div className="gtabs" role="tablist" aria-label="記録の種類">
            {groups.map((g) => (
              <button key={g.name} role="tab" aria-selected={activeTab === g.name} className={activeTab === g.name ? 'sel' : ''} onClick={() => setTab(g.name)}>
                {g.name}<small>{progress(g)}</small>
              </button>
            ))}
            <button role="tab" aria-selected={activeTab === MEMO_TAB} className={activeTab === MEMO_TAB ? 'sel' : ''} onClick={() => setTab(MEMO_TAB)}>
              {sleepInTab ? 'メモ' : '睡眠・メモ'}
            </button>
          </div>
          {activeTab === MEMO_TAB
            ? bodyWithSleep
            : groups
                .filter((g) => g.name === activeTab)
                .map((g) => [
                  g.name === '睡眠' ? <div key="sleep-card">{sleepCard}</div> : null,
                  ...g.sections.map((s) => (
                    <section className="card" key={s.title ?? '_'} aria-label={s.title ?? g.name}>
                      <h2>{s.title ?? g.name}</h2>
                      {s.problems.length > 0 && <p className="muted small">{PROBLEM_SCALE_LABEL}</p>}
                      {s.problems.map((p) => problemBlock(p, 'h3'))}
                      {s.approaches.length > 0 && <p className="muted small">「実施しなかった」と「未回答」は別のものとして扱います。</p>}
                      {s.approaches.map(approachBlock)}
                    </section>
                  )),
                ])}
        </>
      ) : (
        <>
          {problems.map((p) => (
            <section className="card" key={p.id}>
              {problemBlock(p, 'h2')}
              <p className="muted small">{PROBLEM_SCALE_LABEL}</p>
            </section>
          ))}
          {approaches.length > 0 && (
            <section className="card">
              <h2>試したこと</h2>
              <p className="muted small">「実施しなかった」と「未回答」は別のものとして扱います。</p>
              {approaches.map(approachBlock)}
            </section>
          )}
          {!detail && (
            <button type="button" className="more" onClick={() => setDetail(true)}>
              ＋ くわしく入力する（メモ・睡眠・ストレス）
            </button>
          )}
          {detail && bodyWithSleep}
        </>
      )}

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
