import { addDays, madridDay } from './dates';

describe('dates', () => {
  it('madridDay da el día en Madrid, aunque en UTC aún sea el anterior', () => {
    expect(madridDay(new Date('2026-11-04T23:30:00Z'))).toEqual(new Date('2026-11-05'));
    expect(madridDay(new Date('2026-07-04T22:30:00Z'))).toEqual(new Date('2026-07-05'));
    expect(madridDay(new Date('2026-11-04T10:00:00Z'))).toEqual(new Date('2026-11-04'));
  });

  it('addDays resta días cruzando meses', () => {
    expect(addDays(new Date('2026-11-04'), -6)).toEqual(new Date('2026-10-29'));
    expect(addDays(new Date('2026-03-01'), -1)).toEqual(new Date('2026-02-28'));
  });
});
