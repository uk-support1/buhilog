import { render } from '@testing-library/react';
import { Buhio, POSES } from '../src/ui/Buhio';

describe('Buhio', () => {
  it('全ポーズが描画でき、装飾として読み上げ対象外', () => {
    for (const { pose } of POSES) {
      const { container, unmount } = render(<Buhio pose={pose} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('data-pose')).toBe(pose);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      unmount();
    }
    expect(POSES.map((p) => p.pose)).toContain('back');
  });
});
