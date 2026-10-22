import { buildGroups, hasNamedGroups, UNGROUPED } from '../src/domain/groups';
import type { Approach, Problem } from '../src/domain/types';

const P = (id: string, group?: string, section?: string, order = 0): Problem => ({ id, name: id, group, section, order, createdAt: 0, updatedAt: 0 });
const A = (id: string, group?: string): Approach => ({ id, name: id, group, linkedProblemIds: [], createdAt: 0, updatedAt: 0 });

describe('buildGroups', () => {
  it('groupOrder→初出順、未設定は最後の「その他」', () => {
    const g = buildGroups([P('p1', '困りごと', 'からだ'), P('p2', '睡眠'), P('p3')], [A('a1', '運動'), A('a2', '睡眠')], ['睡眠', '運動']);
    expect(g.map((x) => x.name)).toEqual(['睡眠', '運動', '困りごと', UNGROUPED]);
    expect(g[0].sections[0].problems.map((p) => p.id)).toEqual(['p2']);
    expect(g[0].sections[0].approaches.map((a) => a.id)).toEqual(['a2']);
    expect(hasNamedGroups(g)).toBe(true);
  });
  it('グループ未設定だけなら名前付きグループなし', () => {
    const g = buildGroups([P('p1')], [A('a1')]);
    expect(hasNamedGroups(g)).toBe(false);
  });
  it('小見出しごとにまとまる', () => {
    const g = buildGroups([P('p1', 'G', 'x'), P('p2', 'G', 'y'), P('p3', 'G', 'x')], []);
    expect(g[0].sections.map((s) => [s.title, s.problems.map((p) => p.id)])).toEqual([['x', ['p1', 'p3']], ['y', ['p2']]]);
  });
});
