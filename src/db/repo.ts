import { db, type BuhiLogDB } from './db';
import {
  AppSettingsSchema, ApproachSchema, DailyEntrySchema, DEFAULT_SETTINGS, ProblemSchema,
  type AppSettings, type Approach, type DailyEntry, type Problem,
} from '../domain/types';

const newId = () => crypto.randomUUID();

export function createRepo(d: BuhiLogDB = db) {
  return {
    // ---- 困りごと（物理削除なし。アーカイブのみ） ----
    async listProblems(includeArchived = false): Promise<Problem[]> {
      const all = await d.problems.orderBy('order').toArray();
      return includeArchived ? all : all.filter((p) => !p.archivedAt);
    },
    async addProblem(name: string, description?: string, group?: string, section?: string): Promise<Problem> {
      const now = Date.now();
      const all = await d.problems.toArray();
      const order = all.reduce((m, p) => Math.max(m, p.order), -1) + 1;
      const p = ProblemSchema.parse({
        id: newId(), name, description: description || undefined, group: group || undefined, section: section || undefined, order, createdAt: now, updatedAt: now,
      });
      await d.problems.add(p);
      return p;
    },
    async updateProblem(id: string, patch: Partial<Pick<Problem, 'name' | 'description' | 'order' | 'group' | 'section' | 'noteLabel' | 'noteAlways'>>) {
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
      await d.transaction('rw', [d.problems, d.approaches, d.dailyEntries, d.settings], async () => {
        await Promise.all([d.problems.clear(), d.approaches.clear(), d.dailyEntries.clear(), d.settings.clear()]);
      });
    },
  };
}
export type Repo = ReturnType<typeof createRepo>;
export const repo = createRepo();
