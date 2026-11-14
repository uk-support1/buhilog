import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { BuhiLogDB } from '../src/db/db';
import { createRepo } from '../src/db/repo';
import { buildBackup, parseBackup, restoreBackup } from '../src/db/backup';
import { TodoPage } from '../src/features/Todo';

describe('ToDoのデータ', () => {
  it('追加はリストの一番下。別のリストへ移すと、移した先の一番下に入る', async () => {
    const repo = createRepo(new BuhiLogDB('todo-data'));
    await repo.addTodo('shop', '牛乳 2本');
    const b = await repo.addTodo('todo', '書類を出す');
    await repo.addTodo('shop', 'ティッシュ');
    expect((await repo.listTodos()).filter((t) => t.list === 'shop').map((t) => t.text)).toEqual(['牛乳 2本', 'ティッシュ']);
    await repo.updateTodo(b.id, { list: 'shop' });
    expect((await repo.listTodos()).filter((t) => t.list === 'shop').map((t) => t.text)).toEqual(['牛乳 2本', 'ティッシュ', '書類を出す']);
    await repo.updateTodo(b.id, { text: '書類を出しに行く' });
    expect((await repo.listTodos()).find((t) => t.id === b.id)?.text).toBe('書類を出しに行く');
    await expect(repo.addTodo('shop', '   ')).rejects.toThrow();
  });
  it('バックアップに含まれ、復元できる', async () => {
    const db1 = new BuhiLogDB('todo-bk1');
    const repo = createRepo(db1);
    await repo.addTodo('someday', '収納を見直す');
    const json = JSON.stringify(await buildBackup(repo));
    const parsed = parseBackup(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const db2 = new BuhiLogDB('todo-bk2');
    await restoreBackup(db2, parsed.backup);
    expect((await createRepo(db2).listTodos()).map((t) => [t.list, t.text])).toEqual([['someday', '収納を見直す']]);
  });
  it('ToDoがない古いバックアップも読み込める', async () => {
    const repo = createRepo(new BuhiLogDB('todo-bk3'));
    const b = await buildBackup(repo);
    const { todos: _t, ...old } = b;
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup.todos).toEqual([]);
  });
});

describe('ToDo画面', () => {
  it('3つのリストに追加でき、タップすると消え、「元に戻す」で戻る。移す・書き直しもできる', async () => {
    const user = userEvent.setup();
    const repo = createRepo(new BuhiLogDB('todo-ui'));
    const counts: number[] = [];
    render(<TodoPage repo={repo} onCount={(n) => counts.push(n)} />);
    await user.type(await screen.findByLabelText('買い物に追加'), '牛乳 2本{enter}');
    await user.type(screen.getByLabelText('買い物に追加'), 'ティッシュ{enter}');
    await user.type(screen.getByLabelText('いつかに追加'), '収納を見直す{enter}');
    const shop = await screen.findByRole('region', { name: '買い物' });
    expect(await within(shop).findByText('ティッシュ')).toBeInTheDocument();
    expect((screen.getByLabelText('買い物に追加') as HTMLInputElement).value).toBe(''); // 追加したら入力欄は空に
    expect(counts.at(-1)).toBe(3);
    // タップで消える → 元に戻す
    await user.click(within(shop).getByRole('button', { name: '牛乳 2本を済みにして消す' }));
    await waitFor(() => expect(within(shop).queryByText('牛乳 2本')).toBeNull());
    expect(counts.at(-1)).toBe(2);
    await user.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(await within(shop).findByText('牛乳 2本')).toBeInTheDocument();
    expect(counts.at(-1)).toBe(3);
    // 「いつか」→「やること」へ移す
    const someday = screen.getByRole('region', { name: 'いつか' });
    await user.selectOptions(within(someday).getByLabelText('収納を見直すを移す'), 'todo');
    const todo = screen.getByRole('region', { name: 'やること' });
    expect(await within(todo).findByText('収納を見直す')).toBeInTheDocument();
    // 書き直し
    vi.spyOn(window, 'prompt').mockReturnValue('ティッシュ 3箱');
    await user.click(within(shop).getByRole('button', { name: 'ティッシュを書き直す' }));
    expect(await within(shop).findByText('ティッシュ 3箱')).toBeInTheDocument();
  });
});
