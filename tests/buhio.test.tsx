import { render } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { Buhio, POSES } from '../src/ui/Buhio';

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
