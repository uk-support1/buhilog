import { render } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { Buhio, MOTIONS, POSES, type Pose } from '../src/ui/Buhio';

/** 透過つきWebP（VP8X）の画像サイズ。コマ並べ画像が MOTIONS の表とずれていないかの確認に使う */
function webpSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  expect(b.toString('ascii', 12, 16)).toBe('VP8X');
  return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {} }));
}

describe('Buhio', () => {
  it('全ポーズの画像ファイルが存在し、装飾として読み上げ対象外', () => {
    for (const { pose } of POSES) {
      expect(existsSync(`public/buhio/${pose}.webp`)).toBe(true);
      const { container, unmount } = render(<Buhio pose={pose} />);
      const img = container.querySelector('img')!;
      expect(img.getAttribute('data-pose')).toBe(pose);
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('aria-hidden')).toBe('true');
      unmount();
    }
  });
  it('PWAアイコン(PNG)が存在する', () => {
    for (const f of ['apple-touch-icon-v2.png', 'icon-v2-192.png', 'icon-v2-512.png']) expect(existsSync(`public/${f}`)).toBe(true);
  });
});

describe('Buhio（動くぶひお）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('動きのあるポーズは、コマ並べ画像が存在し、サイズが表と一致する', () => {
    const poses = Object.keys(MOTIONS) as Pose[];
    expect(poses.sort()).toEqual(['jumping', 'waving']);
    for (const pose of poses) {
      const m = MOTIONS[pose]!;
      expect(webpSize(`public/buhio/motion/${pose}.webp`)).toEqual({ w: m.frames * m.w, h: m.h });
    }
  });
  it('コマ数が、CSSのコマ送り（@keyframes）と一致し、最後のコマで止まる', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    for (const [pose, m] of Object.entries(MOTIONS)) {
      const block = css.match(new RegExp(`@keyframes buhio-${pose} \\{(.*)\\}\\s*\\n`))?.[1] ?? '';
      const steps = [...block.matchAll(/([\d.]+)% \{ background-position:([\d.]+)%? 0; \}/g)].map((x) => [Number(x[1]), Number(x[2])]);
      const n = m!.frames;
      expect(steps.length).toBe(n + 1); // n コマ + 終点（終点を書かないと、終了後に最初のコマへ戻ってしまう）
      for (let i = 0; i < n; i++) {
        expect(steps[i][0]).toBeCloseTo((i / n) * 100, 3); // 各コマの切り替え時刻（均等）
        expect(steps[i][1]).toBeCloseTo((i / (n - 1)) * 100, 3); // 画像上の位置（先頭0%〜最後100%）
      }
      expect(steps[n]).toEqual([100, 100]); // 終点は最後のコマのまま
    }
  });
  it('animate を付けると、装飾（読み上げ対象外）のコマ送り表示になる', () => {
    stubReducedMotion(false);
    const { container } = render(<Buhio pose="jumping" size={64} animate />);
    expect(container.querySelector('img')).toBeNull();
    const el = container.querySelector('[data-motion="jumping"]') as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('data-pose')).toBe('jumping');
    expect(el.style.height).toBe('64px');
    expect(el.style.width).toBe(`${Math.round((64 * 153) / 178)}px`);
    expect(el.style.backgroundSize).toBe('500% 100%');
    expect(el.style.animationName).toBe('buhio-jumping');
    expect(el.style.animationDuration).toBe('600ms');
  });
  it('animate を付けなければ静止画のまま', () => {
    const { container } = render(<Buhio pose="jumping" />);
    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('[data-motion]')).toBeNull();
  });
  it('動きの無いポーズは animate を付けても静止画', () => {
    const { container } = render(<Buhio pose="pointing" animate />);
    expect(container.querySelector('img[data-pose="pointing"]')).not.toBeNull();
    expect(container.querySelector('[data-motion]')).toBeNull();
  });
  it('「視覚効果を減らす」設定のときは、animate を付けても静止画', () => {
    stubReducedMotion(true);
    const { container } = render(<Buhio pose="waving" animate />);
    expect(container.querySelector('img[data-pose="waving"]')).not.toBeNull();
    expect(container.querySelector('[data-motion]')).toBeNull();
  });
});
