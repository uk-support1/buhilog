// 点数(1〜5)の入力とグラフの見た目確認（架空データのみ）: node tests/e2e/shots-score.mjs <出力ディレクトリ>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const out = process.argv[2] ?? '.';
const srv = spawn('npx', ['vite', 'preview', '--port', '4177', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: 'ja-JP' });
const p = await ctx.newPage();
await p.goto('http://localhost:4177/buhilog/');
await p.getByRole('button', { name: 'はじめる' }).click();
await p.getByRole('button', { name: '＋睡眠' }).click();
await p.getByRole('button', { name: '記録をはじめる' }).click();
const today = new Date();
const iso = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
let first = true;
for (const [back, score] of [[6, 4], [5, 4], [4, 2], [3, 1], [2, 3], [1, 5], [0, 4]]) {
  await p.getByLabel('記録する日').fill(iso(back));
  await p.getByRole('radiogroup', { name: '睡眠の調子' }).getByRole('radio', { name: String(score), exact: true }).click();
  if (first) { await p.screenshot({ path: `${out}/8-score.png` }); first = false; }
  await p.getByRole('button', { name: /保存する/ }).click();
  await p.getByText('保存しました').waitFor();
}
await p.getByRole('button', { name: 'ふりかえり' }).click();
await p.getByText('睡眠の推移').waitFor();
await p.screenshot({ path: `${out}/9-chart.png` });
await b.close(); srv.kill();
