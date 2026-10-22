import { awakeningTotal, nightHours, totalSleepHours } from '../src/domain/sleep';

describe('sleep', () => {
  it('日をまたぐ就寝でも夜の睡眠時間を計算する', () => {
    expect(nightHours('23:30', '06:30')).toBe(7);
    expect(nightHours('22:30', '06:00')).toBe(7.5);
    expect(nightHours('00:00', '06:00')).toBe(6);
    expect(nightHours('01:00', '06:30')).toBe(5.5);
    expect(nightHours('21:30', '06:00')).toBe(8.5);
  });
  it('表の運用と同じ: 起床−就寝＋昼寝（例: -1.5→6時, 昼寝0 = 7.5 / 0時→6時＋昼寝2 = 8）', () => {
    expect(totalSleepHours('22:30', '06:00', 0)).toBe(7.5);
    expect(totalSleepHours('00:00', '06:00', 2)).toBe(8);
    expect(totalSleepHours('23:00', '06:30')).toBe(7.5);
  });
  it('時刻が揃っていなければ null／不正な時刻も null', () => {
    expect(totalSleepHours('23:00', undefined)).toBeNull();
    expect(nightHours('25:00', '06:00')).toBeNull();
  });
  it('中途覚醒の合計は5区間（1〜6時間目）の合計、未入力と0を区別', () => {
    expect(awakeningTotal([null, null, 1, 1, 1])).toBe(3);
    expect(awakeningTotal([0, null, null, null, null])).toBe(0);
    expect(awakeningTotal([null, null, null, null, null])).toBeNull();
    expect(awakeningTotal(undefined)).toBeNull();
  });
});
