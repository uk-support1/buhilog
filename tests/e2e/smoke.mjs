// 使い方: npm run build && node tests/e2e/smoke.mjs  （合成データのみ使用）
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const srv = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' , args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
const page = await ctx.newPage();
const external = [];
page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173')) external.push(r.url()); });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const url = 'http://localhost:4173/buhilog/';
const check = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

await page.goto(url);
await page.getByRole('button', { name: 'はじめる' }).click();
await page.getByRole('button', { name: '＋睡眠' }).click();
await page.getByRole('button', { name: '記録をはじめる' }).click();
await page.getByRole('button', { name: '管理' }).click();
await page.getByLabel('新しいアプローチ').fill('ストレッチ');
await page.getByRole('button', { name: '追加' }).last().click();
await page.getByRole('button', { name: '今日' }).click();
await page.getByRole('radiogroup', { name: '睡眠の調子' }).getByRole('radio', { name: '4', exact: true }).click();
await page.getByRole('button', { name: /保存する/ }).click();
await page.getByText('保存しました').waitFor({ timeout: 5000 });
check(true, '保存できる');
await page.screenshot({ path: process.env.SHOT ?? 'today.png' });
await page.reload();
await page.getByRole('button', { name: 'ふりかえり' }).click();
await page.getByText('睡眠の推移').waitFor({ timeout: 5000 });
await page.getByText('評価を記録したのは').waitFor();
check(await page.locator('svg[role=img]').count() === 1, '再読み込み後もデータが残りグラフが出る');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); // SW が制御下に入るまで一度読み直す
await ctx.setOffline(true);
await page.reload();
await page.getByRole('button', { name: 'ふりかえり' }).click();
await page.getByText('睡眠の推移').waitFor({ timeout: 5000 });
check(true, 'オフラインでも開けて記録が読める');
await ctx.setOffline(false);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!overflow, '横スクロールなし(390px)');
check(external.length === 0, `外部リクエストなし ${external.join(',')}`);
check(errors.length === 0, `JSエラーなし ${errors.join(',')}`);
await browser.close();
srv.kill();
