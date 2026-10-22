// 睡眠・量・メモの見た目確認（架空データのみ）: node tests/e2e/shots-v3.mjs <出力ディレクトリ> <架空バックアップJSON>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const [out = '.', json] = process.argv.slice(2);
const srv = spawn('npx', ['vite', 'preview', '--port', '4178', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: 'ja-JP' });
const p = await ctx.newPage();
p.on('dialog', (d) => d.accept());
await p.goto('http://localhost:4178/buhilog/');
await p.getByRole('button', { name: 'はじめる' }).click();
await p.getByRole('button', { name: '後で登録する' }).click();
await p.getByRole('button', { name: '設定' }).click();
await p.locator('input[type=file]').setInputFiles(json);
await p.getByRole('button', { name: 'この内容で置き換える' }).click();
await p.getByRole('tablist', { name: '記録の種類' }).waitFor(); // 復元に成功すると、自動で「記録」画面に切り替わる
await p.getByRole('tab', { name: /睡眠/ }).click();
await p.getByLabel('就寝時刻 時').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/10-sleep.png` });
await p.getByText('中途覚醒の回数').evaluate((el) => el.scrollIntoView({ block: 'start' }));
await p.evaluate(() => window.scrollBy(0, -120));
await p.screenshot({ path: `${out}/11-awake.png` });
await p.getByRole('tab', { name: /前夜要因/ }).click();
await p.getByRole('radio', { name: '実施した' }).click();
await p.screenshot({ path: `${out}/12-alcohol.png` });
await p.getByRole('tab', { name: 'メモ' }).click();
await p.screenshot({ path: `${out}/13-memo.png` });
await b.close(); srv.kill();
