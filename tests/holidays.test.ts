import { holidayName } from '../src/domain/holidays';

describe('日本の祝日', () => {
  it('2026年', () => {
    const m: Record<string, string> = {
      '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日', '2026-02-23': '天皇誕生日', '2026-03-20': '春分の日',
      '2026-04-29': '昭和の日', '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日', '2026-05-05': 'こどもの日', '2026-05-06': '振替休日',
      '2026-07-20': '海の日', '2026-08-11': '山の日', '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日',
      '2026-10-12': 'スポーツの日', '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
    };
    for (const [d, n] of Object.entries(m)) expect(holidayName(d), d).toBe(n);
    expect(holidayName('2026-10-26')).toBeUndefined();
    expect(holidayName('2026-12-25')).toBeUndefined();
  });
  it('年によるずれ（春分・秋分・東京五輪の年・2027年の振替）', () => {
    expect(holidayName('2027-03-21')).toBe('春分の日');
    expect(holidayName('2027-03-22')).toBe('振替休日');
    expect(holidayName('2027-09-23')).toBe('秋分の日');
    expect(holidayName('2021-07-22')).toBe('海の日');
    expect(holidayName('2021-07-19')).toBeUndefined();
    expect(holidayName('2024-02-12')).toBe('振替休日');
    expect(holidayName('2025-11-24')).toBe('振替休日');
  });
});
