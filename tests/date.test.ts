import { addDays, isValidLocalDate, toLocalDate } from '../src/domain/date';

describe('date', () => {
  it('ローカル日付で整形する（UTCズレなし）', () => {
    expect(toLocalDate(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(toLocalDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
  it('検証と加算', () => {
    expect(isValidLocalDate('2026-02-30')).toBe(false);
    expect(isValidLocalDate('2024-02-29')).toBe(true);
    expect(isValidLocalDate('2026/01/01')).toBe(false);
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
