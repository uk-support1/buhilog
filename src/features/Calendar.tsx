import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Repo } from '../db/repo';
import { addDays, formatJa, toLocalDate } from '../domain/date';
import { COLOR_HEX, COLOR_LABEL, colorOf, eventsInRange, eventsOn, REPEAT_LABEL, timeLabel, WEEKDAY_LABEL, weekdayOf, type Occurrence } from '../domain/schedule';
import { EVENT_COLORS, type CalendarEvent, type Repeat } from '../domain/types';
import { holidayName } from '../domain/holidays';
import { parseIcs, type IcsResult } from '../domain/ics';
import { TimeSelect } from '../ui/TimeSelect';

type Freq = '' | Repeat['freq'];
interface Draft {
  id?: string;
  title: string;
  date: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  place: string;
  memo: string;
  color: string;
  freq: Freq;
  interval: string;
  weekdays: number[];
  until: string;
  exdates?: string[];
  uid?: string;
  source?: 'manual' | 'ics';
  createdAt?: number;
}

const newDraft = (date: string): Draft => ({ title: '', date, endDate: '', allDay: false, startTime: '', endTime: '', place: '', memo: '', color: 'blue', freq: '', interval: '1', weekdays: [], until: '' });
const fromEvent = (e: CalendarEvent): Draft => ({
  id: e.id, title: e.title, date: e.date, endDate: e.endDate ?? '', allDay: e.allDay, startTime: e.startTime ?? '', endTime: e.endTime ?? '',
  place: e.place ?? '', memo: e.memo ?? '', color: e.color ?? 'blue', freq: e.repeat?.freq ?? '', interval: String(e.repeat?.interval ?? 1), weekdays: e.repeat?.weekdays ?? [],
  until: e.repeat?.until ?? '', exdates: e.exdates, uid: e.uid, source: e.source,
});

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split('-').map(Number);
  const t = mo - 1 + delta;
  return `${y + Math.floor(t / 12)}-${String((((t % 12) + 12) % 12) + 1).padStart(2, '0')}-01`;
};

export function Calendar({ repo, initialDate, onPick }: { repo: Repo; initialDate?: string; onPick?: (date: string) => void }) {
  const today = toLocalDate();
  const [selected, setSelected] = useState(initialDate ?? today);
  const [month, setMonth] = useState(monthStart(initialDate ?? today));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [recorded, setRecorded] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [ics, setIcs] = useState<(IcsResult & { name: string }) | null>(null);
  const [icsMsg, setIcsMsg] = useState('');

  const pickIcs = async (file: File | undefined) => {
    setIcsMsg('');
    if (!file) return;
    if (file.size > 5_000_000) { setIcsMsg('ファイルが大きすぎます（5MBまで）。'); return; }
    const r = parseIcs(await file.text());
    if (r.events.length === 0) { setIcs(null); setIcsMsg('読み込める予定が見つかりませんでした。'); return; }
    setIcs({ ...r, name: file.name });
  };
  const doImport = async () => {
    if (!ics) return;
    try {
      const r = await repo.importEvents(ics.events);
      setIcsMsg(`読み込みました：追加 ${r.added}件${r.updated ? `、更新 ${r.updated}件` : ''}。`);
      setIcs(null);
      await reload();
    } catch { setIcsMsg('読み込みに失敗しました。ファイルの内容を確認してください。'); }
  };

  const reload = useCallback(async () => {
    setEvents(await repo.listEvents());
    setRecorded(new Set((await repo.listEntries()).map((e) => e.localDate)));
  }, [repo]);
  useEffect(() => { void reload(); }, [reload]);

  // 月の表示範囲（日曜はじまり、6週間分）
  const gridStart = addDays(month, -weekdayOf(month));
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const byDay = useMemo(() => eventsInRange(events, days[0], days[41]), [events, days]);
  const dayList: Occurrence[] = useMemo(() => eventsOn(events, selected), [events, selected]);

  const save = async () => {
    if (!draft) return;
    setErr('');
    const interval = Number(draft.interval);
    if (draft.freq && (!Number.isInteger(interval) || interval < 1)) { setErr('繰り返しの間隔は、1以上の整数にしてください。'); return; }
    try {
      await repo.saveEvent({
        ...(draft.id ? { id: draft.id } : {}),
        title: draft.title,
        date: draft.date,
        endDate: draft.endDate || undefined,
        allDay: draft.allDay,
        startTime: draft.allDay ? undefined : draft.startTime || undefined,
        endTime: draft.allDay ? undefined : draft.endTime || undefined,
        place: draft.place.trim() || undefined,
        memo: draft.memo.trim() || undefined,
        color: draft.color === 'blue' ? undefined : (draft.color as (typeof EVENT_COLORS)[number]),
        repeat: draft.freq
          ? { freq: draft.freq, interval, ...(draft.freq === 'weekly' && draft.weekdays.length ? { weekdays: [...draft.weekdays].sort() } : {}), ...(draft.until ? { until: draft.until } : {}) }
          : undefined,
        exdates: draft.exdates?.length ? draft.exdates : undefined,
        uid: draft.uid,
        source: draft.source ?? 'manual',
      });
      setSelected(draft.date);
      setMonth(monthStart(draft.date));
      setDraft(null);
      await reload();
    } catch (e) {
      const issue = (e as { issues?: { message: string }[] }).issues?.[0]?.message;
      setErr(issue ?? '保存できませんでした。入力内容を確認してください。');
    }
  };

  const removeAll = async (ev: CalendarEvent) => {
    if (!confirm(`「${ev.title}」を削除します${ev.repeat ? '（繰り返しの、すべての日が消えます）' : ''}。元に戻せません。よろしいですか？`)) return;
    await repo.deleteEvent(ev.id);
    setDraft(null);
    await reload();
  };
  const removeOne = async (ev: CalendarEvent, startDate: string) => {
    if (!confirm(`${formatJa(startDate)}の「${ev.title}」だけを削除します。よろしいですか？`)) return;
    await repo.saveEvent({ ...ev, exdates: [...(ev.exdates ?? []), startDate] });
    setDraft(null);
    await reload();
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const [y, m] = month.split('-').map(Number);
  const editingOcc = draft?.id ? dayList.find((o) => o.event.id === draft.id) : undefined;

  return (
    <div>
      <section className="card cal">
        <div className="calhead">
          <button type="button" aria-label="前の月" onClick={() => setMonth(shiftMonth(month, -1))}>◀</button>
          <h2>{y}年{m}月</h2>
          <button type="button" aria-label="次の月" onClick={() => setMonth(shiftMonth(month, 1))}>▶</button>
          <button type="button" onClick={() => { setMonth(monthStart(today)); setSelected(today); }}>今日</button>
        </div>
        <div className="calgrid" role="grid" aria-label={`${y}年${m}月のカレンダー`}>
          {WEEKDAY_LABEL.map((w, i) => <div key={w} role="columnheader" className={`wd wd${i}`}>{w}</div>)}
          {days.map((d, di) => {
            const hol = holidayName(d);
            const list = byDay.get(d) ?? [];
            const inMonth = d.slice(0, 7) === month.slice(0, 7);
            const cls = ['day', inMonth ? '' : 'out', d === today ? 'today' : '', d === selected ? 'sel' : '', hol || di % 7 === 0 ? 'red' : di % 7 === 6 ? 'blue' : ''].join(' ');
            return (
              <button key={d} type="button" role="gridcell" className={cls} aria-pressed={d === selected} aria-label={`${formatJa(d)}${list.length ? ` 予定${list.length}件` : ''}${recorded.has(d) ? ' 記録あり' : ''}${hol ? ` 祝日 ${hol}` : ''}`} onClick={() => setSelected(d)}>
                <span className="num">{Number(d.slice(8))}</span>
                {hol && <span className="hol" aria-hidden="true">{hol}</span>}
                <span className="dots" aria-hidden="true">{list.slice(0, 3).map((o, i) => <i key={i} style={{ background: colorOf(o.event) }} />)}{list.length > 3 && '+'}</span>
                {recorded.has(d) && <span className="rec" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
        <p className="muted small">● 予定あり　✓ 記録あり</p>
      </section>

      <section className="card" aria-label={`${formatJa(selected)}の予定`}>
        <div className="row">
          <h2 className="grow">{formatJa(selected)}の予定{holidayName(selected) && <small className="badge hol-badge">祝日 {holidayName(selected)}</small>}</h2>
          {onPick && <button type="button" onClick={() => onPick(selected)}>この日の記録へ</button>}
        </div>
        {dayList.length === 0 && !draft && <p className="muted small">予定はありません。</p>}
        <ul className="plain">
          {dayList.map((o, i) => (
            <li key={`${o.event.id}-${i}`} className="evrow" style={{ borderLeftColor: colorOf(o.event) }}>
              <span className="evtime">{timeLabel(o)}</span>
              <span className="evmain">
                <strong>{o.event.title}</strong>
                {o.event.repeat && <small className="badge">{REPEAT_LABEL[o.event.repeat.freq]}</small>}
                {o.event.place && <small className="muted"> ／{o.event.place}</small>}
                {o.event.memo && <small className="evmemo muted">{o.event.memo}</small>}
              </span>
              <button type="button" onClick={() => setDraft(fromEvent(o.event))}>編集</button>
            </li>
          ))}
        </ul>
        {!draft && <button type="button" className="primary" onClick={() => setDraft(newDraft(selected))}>＋ この日に予定を追加</button>}
      </section>

      {draft && (
        <section className="card evform" aria-label={draft.id ? '予定を編集' : '予定を追加'}>
          <h2>{draft.id ? '予定を編集' : '予定を追加'}</h2>
          <label className="field">予定の名前<input value={draft.title} maxLength={100} onChange={(e) => set({ title: e.target.value })} placeholder="例: 通院" /></label>
          <div className="two">
            <label className="field">開始日<input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} /></label>
            <label className="field">終了日（複数日のとき）<input type="date" value={draft.endDate} min={draft.date} onChange={(e) => set({ endDate: e.target.value })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={draft.allDay} onChange={(e) => set({ allDay: e.target.checked })} />終日</label>
          {!draft.allDay && (
            <div className="two">
              <TimeSelect label="開始時刻" value={draft.startTime} startHour={6} onChange={(v) => set({ startTime: v })} />
              <TimeSelect label="終了時刻" value={draft.endTime} startHour={6} onChange={(v) => set({ endTime: v })} />
            </div>
          )}
          <div role="radiogroup" aria-label="色" className="field">
            <span>色</span>
            <div className="colors">
              {EVENT_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={draft.color === c} aria-label={COLOR_LABEL[c]} className={draft.color === c ? 'sel' : ''} style={{ background: COLOR_HEX[c] }} onClick={() => set({ color: c })} />
              ))}
            </div>
          </div>
          <label className="field">場所<input value={draft.place} maxLength={100} onChange={(e) => set({ place: e.target.value })} /></label>
          <label className="field">メモ<textarea rows={2} maxLength={2000} value={draft.memo} onChange={(e) => set({ memo: e.target.value })} /></label>
          <label className="field">
            くりかえし
            <select value={draft.freq} onChange={(e) => set({ freq: e.target.value as Freq, weekdays: e.target.value === 'weekly' && !draft.weekdays.length ? [weekdayOf(draft.date)] : draft.weekdays })}>
              <option value="">なし</option>
              {(Object.keys(REPEAT_LABEL) as Repeat['freq'][]).map((f) => <option key={f} value={f}>{REPEAT_LABEL[f]}</option>)}
            </select>
          </label>
          {draft.freq && (
            <>
              <label className="field">間隔（{draft.freq === 'daily' ? '日' : draft.freq === 'weekly' ? '週' : draft.freq === 'monthly' ? 'か月' : '年'}ごと）<input inputMode="numeric" value={draft.interval} onChange={(e) => set({ interval: e.target.value.replace(/[^0-9]/g, '') })} /></label>
              {draft.freq === 'weekly' && (
                <div role="group" aria-label="曜日" className="seg">
                  {WEEKDAY_LABEL.map((w, i) => (
                    <button key={w} type="button" aria-pressed={draft.weekdays.includes(i)} className={draft.weekdays.includes(i) ? 'sel' : ''} onClick={() => set({ weekdays: draft.weekdays.includes(i) ? draft.weekdays.filter((x) => x !== i) : [...draft.weekdays, i] })}>{w}</button>
                  ))}
                </div>
              )}
              <label className="field">くりかえしの終わり（空欄なら、ずっと）<input type="date" value={draft.until} min={draft.date} onChange={(e) => set({ until: e.target.value })} /></label>
            </>
          )}
          {err && <p role="alert" className="err">{err}</p>}
          <button type="button" className="primary" onClick={save}>保存する</button>
          <div className="row wrap">
            <button type="button" onClick={() => { setDraft(null); setErr(''); }}>キャンセル</button>
            {draft.id && editingOcc && editingOcc.event.repeat && (
              <button type="button" className="danger" onClick={() => removeOne(editingOcc.event, editingOcc.startDate)}>この日だけ削除</button>
            )}
            {draft.id && (
              <button type="button" className="danger" onClick={() => { const ev = events.find((x) => x.id === draft.id); if (ev) void removeAll(ev); }}>
                {draft.freq ? 'すべて削除' : '削除'}
              </button>
            )}
          </div>
        </section>
      )}
      <section className="card" aria-label="カレンダーファイルの読み込み">
        <h3>カレンダーファイル(.ics)を読み込む</h3>
        <p className="muted">Googleカレンダーなどから書き出したファイルを、この端末の中だけで取り込みます（外部には送りません）。同じ予定を読み込み直しても、重複しません。</p>
        <input type="file" accept=".ics,text/calendar" aria-label="カレンダーファイルを選ぶ" onChange={(e) => { void pickIcs(e.target.files?.[0]); e.target.value = ''; }} />
        {ics && (
          <>
            <p>{ics.name}：予定 {ics.events.length}件{ics.skipped > 0 && `（対応できない予定 ${ics.skipped}件は、飛ばします）`}</p>
            <button type="button" className="primary" onClick={doImport}>この{ics.events.length}件を読み込む</button>
          </>
        )}
        {icsMsg && <p role="status">{icsMsg}</p>}
      </section>
    </div>
  );
}
