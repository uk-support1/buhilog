import { db, type BuhiLogDB } from './db';
import {
  AppSettingsSchema, EventSchema, ApproachSchema, DailyEntrySchema, DEFAULT_SETTINGS, ProblemSchema,
  type AppSettings, type Approach, type CalendarEvent, type DailyEntry, type Medication, type Problem,
} from '../domain/types';

const newId = () => crypto.randomUUID();

export function createRepo(d: BuhiLogDB = db) {
  return {
    // ---- 困りごと（物理削除なし。アーカイブのみ） ----
    async listProblems(includeArchived = false): Promise<Problem[]> {
      const all = await d.problems.orderBy('order').toArray();
      return includeArchived ? all : all.filter((p) => !p.archivedAt);
    },
    /** afterId を渡すと、その項目の直後に入れ、グループと小見出しも同じにする（group・section を渡せばそちらを優先） */
    async addProblem(name: string, description?: string, group?: string, section?: string, opts: { afterId?: string; asFactor?: boolean } = {}): Promise<Problem> {
      return d.transaction('rw', d.problems, async () => {
        const now = Date.now();
        const all = await d.problems.orderBy('order').toArray();
        const after = opts.afterId ? all.find((x) => x.id === opts.afterId) : undefined;
        if (opts.afterId && !after) throw new Error('指定した項目が見つかりません');
        const p = ProblemSchema.parse({
          id: newId(), name, description: description || undefined,
          group: group || after?.group || undefined, section: section || (group ? undefined : after?.section) || undefined,
          ...(opts.asFactor ? { asFactor: true } : {}),
          order: all.reduce((m, x) => Math.max(m, x.order), -1) + 1, createdAt: now, updatedAt: now,
        });
        if (!after) { await d.problems.add(p); return p; }
        // 直後に入れるため、並び順を振り直す
        const list = [...all];
        list.splice(list.findIndex((x) => x.id === after.id) + 1, 0, p);
        await d.problems.add(p);
        for (const [i, x] of list.entries()) if (x.order !== i) await d.problems.update(x.id, { order: i });
        return { ...p, order: list.indexOf(p) };
      });
    },
    async updateProblem(id: string, patch: Partial<Pick<Problem, 'name' | 'description' | 'order' | 'group' | 'section' | 'noteLabel' | 'noteAlways' | 'pairedApproachId' | 'asFactor'>>) {
      await d.transaction('rw', d.problems, async () => {
        const cur = await d.problems.get(id);
        if (!cur) throw new Error('困りごとが見つかりません');
        await d.problems.put(ProblemSchema.parse({ ...cur, ...patch, updatedAt: Date.now() }));
      });
    },
    async setProblemArchived(id: string, archived: boolean) {
      await d.transaction('rw', d.problems, async () => {
        const cur = await d.problems.get(id);
        if (!cur) throw new Error('困りごとが見つかりません');
        const next: Problem = { ...cur, updatedAt: Date.now() };
        if (archived) next.archivedAt = Date.now(); else delete next.archivedAt;
        await d.problems.put(ProblemSchema.parse(next));
      });
    },
    /** 隣と順序を入れ替える（表示中の並び基準） */
    async moveProblem(id: string, dir: -1 | 1) {
      await d.transaction('rw', d.problems, async () => {
        const list = (await d.problems.orderBy('order').toArray()).filter((p) => !p.archivedAt);
        const i = list.findIndex((p) => p.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        const [a, b] = [list[i], list[j]];
        await d.problems.update(a.id, { order: b.order, updatedAt: Date.now() });
        await d.problems.update(b.id, { order: a.order, updatedAt: Date.now() });
      });
    },

    // ---- アプローチ ----
    async listApproaches(includeArchived = false): Promise<Approach[]> {
      const all = (await d.approaches.toArray()).sort((a, b) => a.createdAt - b.createdAt);
      return includeArchived ? all : all.filter((a) => !a.archivedAt);
    },
    async addApproach(name: string, linkedProblemIds: string[], notes?: string, group?: string, section?: string): Promise<Approach> {
      const now = Date.now();
      const a = ApproachSchema.parse({
        id: newId(), name, notes: notes || undefined, group: group || undefined, section: section || undefined, linkedProblemIds, createdAt: now, updatedAt: now,
      });
      await d.approaches.add(a);
      return a;
    },
    async updateApproach(id: string, patch: Partial<Pick<Approach, 'name' | 'notes' | 'linkedProblemIds' | 'group' | 'section' | 'quantity'>>) {
      await d.transaction('rw', d.approaches, async () => {
        const cur = await d.approaches.get(id);
        if (!cur) throw new Error('アプローチが見つかりません');
        await d.approaches.put(ApproachSchema.parse({ ...cur, ...patch, updatedAt: Date.now() }));
      });
    },
    async setApproachArchived(id: string, archived: boolean) {
      await d.transaction('rw', d.approaches, async () => {
        const cur = await d.approaches.get(id);
        if (!cur) throw new Error('アプローチが見つかりません');
        const next: Approach = { ...cur, updatedAt: Date.now() };
        if (archived) next.archivedAt = Date.now(); else delete next.archivedAt;
        await d.approaches.put(ApproachSchema.parse(next));
      });
    },

    // ---- 日次記録（localDate 一意。同日はトランザクションで上書き更新） ----
    async getEntry(localDate: string): Promise<DailyEntry | undefined> {
      return d.dailyEntries.where('localDate').equals(localDate).first();
    },
    async listEntries(): Promise<DailyEntry[]> {
      return d.dailyEntries.orderBy('localDate').toArray();
    },
    async saveEntry(input: Omit<DailyEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<DailyEntry> {
      return d.transaction('rw', d.dailyEntries, async () => {
        const cur = await d.dailyEntries.where('localDate').equals(input.localDate).first();
        const now = Date.now();
        const e = DailyEntrySchema.parse({
          ...input, id: cur?.id ?? newId(), createdAt: cur?.createdAt ?? now, updatedAt: now,
        });
        await d.dailyEntries.put(e);
        return e;
      });
    },
    async deleteEntry(localDate: string) {
      await d.dailyEntries.where('localDate').equals(localDate).delete();
    },

    // ---- 服薬の項目（記録のみ） ----
    async listMedications(includeArchived = false): Promise<Medication[]> {
      const all = (await d.medications.toArray()).sort((a, b) => a.order - b.order);
      return includeArchived ? all : all.filter((m) => !m.archivedAt);
    },

    // ---- 予定（カレンダー） ----
    async listEvents(): Promise<CalendarEvent[]> {
      return (await d.events.toArray()).sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
    },
    /** id があれば更新、なければ新規。検証に通らなければ例外 */
    async saveEvent(input: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<CalendarEvent> {
      return d.transaction('rw', d.events, async () => {
        const cur = input.id ? await d.events.get(input.id) : undefined;
        const now = Date.now();
        const e = EventSchema.parse({ ...input, id: cur?.id ?? input.id ?? newId(), createdAt: cur?.createdAt ?? now, updatedAt: now });
        await d.events.put(e);
        return e;
      });
    },
    async deleteEvent(id: string) { await d.events.delete(id); },
    /** 読み込んだ予定を追加する。同じ元ID(uid)の予定は、上書きして重複させない。追加・更新の件数を返す */
    async importEvents(list: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<{ added: number; updated: number }> {
      return d.transaction('rw', d.events, async () => {
        const byUid = new Map((await d.events.toArray()).filter((e) => e.uid).map((e) => [e.uid!, e]));
        let added = 0, updated = 0;
        const now = Date.now();
        for (const input of list) {
          const cur = input.uid ? byUid.get(input.uid) : undefined;
          const e = EventSchema.parse({ ...input, id: cur?.id ?? newId(), createdAt: cur?.createdAt ?? now, updatedAt: now });
          await d.events.put(e);
          if (cur) updated++; else added++;
        }
        return { added, updated };
      });
    },

    // ---- 設定 ----
    async getSettings(): Promise<AppSettings> {
      const row = await d.settings.get('app');
      if (!row) return { ...DEFAULT_SETTINGS };
      const { key: _k, ...rest } = row;
      return AppSettingsSchema.parse(rest);
    },
    async saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
      return d.transaction('rw', d.settings, async () => {
        const cur = await this.getSettings();
        const next = AppSettingsSchema.parse({ ...cur, ...patch });
        await d.settings.put({ ...next, key: 'app' });
        return next;
      });
    },

    /** 全件削除（設定画面から二重確認のうえ呼ぶ） */
    async wipeAll() {
      await d.transaction('rw', [d.problems, d.approaches, d.dailyEntries, d.settings, d.medications, d.events], async () => {
        await Promise.all([d.problems.clear(), d.approaches.clear(), d.dailyEntries.clear(), d.settings.clear(), d.medications.clear(), d.events.clear()]);
      });
    },
  };
}
export type Repo = ReturnType<typeof createRepo>;
export const repo = createRepo();
