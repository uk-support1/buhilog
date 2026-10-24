// 睡眠の初期値表示とまとめボタンの見た目確認（架空データのみ）: node tests/e2e/shots-ghost.mjs <出力ディレクトリ> <架空バックアップJSON>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const [out = '.', json] = process.argv.slice(2);
const srv = spawn('npx', ['vite', 'preview', '--port', '4181', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: 'ja-JP' });
const p = await ctx.newPage();
p.on('dialog', (d) => d.accept());
await p.goto('http://localhost:4181/buhilog/');
await p.getByRole('button', { name: 'はじめる' }).click();
await p.getByRole('button', { name: '後で登録する' }).click();
await p.getByRole('button', { name: '設定' }).click();
await p.locator('input[type=file]').setInputFiles(json);
await p.getByRole('button', { name: 'この内容で置き換える' }).click();
await p.getByRole('tablist', { name: '記録の種類' }).waitFor();
await p.getByLabel('記録する日').fill('2026-12-01'); // 記録のない日
await p.getByRole('tab', { name: /睡眠/ }).click();
await p.getByRole('heading', { name: '睡眠', exact: true }).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
await p.screenshot({ path: `${out}/18-ghost.png` });
await p.getByRole('tab', { name: /運動要因/ }).click();
await p.getByRole('heading', { name: '運動要因' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
await p.screenshot({ path: `${out}/19-bulk.png` });
await b.close(); srv.kill();
