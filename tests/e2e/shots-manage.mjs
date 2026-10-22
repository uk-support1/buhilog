// 管理・履歴画面の見た目確認（架空データのみ）: node tests/e2e/shots-manage.mjs <出力ディレクトリ>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const out = process.argv[2] ?? '.';
const srv = spawn('npx', ['vite', 'preview', '--port', '4176', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: 'ja-JP' });
const p = await ctx.newPage();
let ans = '睡眠';
p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? ans : undefined));
await p.goto('http://localhost:4176/buhilog/');
await p.getByRole('button', { name: 'はじめる' }).click();
await p.getByRole('button', { name: '後で登録する' }).click();
await p.getByRole('button', { name: '管理' }).click();
for (const [name, g] of [['睡眠の質', '睡眠'], ['朝の調子', '困りごと／一日の調子'], ['耳鳴り・衣類の締め付け', '困りごと／からだ']]) {
  await p.getByLabel('新しい困りごと').fill(name);
  await p.getByRole('button', { name: '追加' }).first().click();
  ans = g;
  await p.locator('li', { hasText: name }).getByRole('button', { name: 'グループ', exact: true }).click();
}
await p.getByLabel('新しいアプローチ').fill('寝る前1時間スマホを見ない');
await p.getByRole('button', { name: '追加' }).last().click();
await p.screenshot({ path: `${out}/6-manage.png` });
await p.getByRole('button', { name: '今日' }).click();
await p.getByRole('radiogroup', { name: '睡眠の質の強さ' }).getByRole('radio', { name: '3', exact: true }).click();
await p.getByRole('button', { name: /保存する/ }).click();
await p.getByText('保存しました').waitFor();
await p.getByRole('button', { name: '履歴' }).click();
await p.screenshot({ path: `${out}/7-history.png` });
await b.close(); srv.kill();
