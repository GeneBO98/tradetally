const {
  isExtendedHoursSession,
  isNewsPeakWindow,
  lastExtendedSessionClose
} = require('../../src/utils/usMarketSchedule');

describe('usMarketSchedule', () => {
  test.each([
    ['Monday 10:00 EST', '2026-11-09T15:00:00Z', true, true],
    ['Monday 05:00 EDT (pre-market, before the news window)', '2026-07-06T09:00:00Z', true, false],
    ['Monday 21:00 EST (after-hours closed)', '2026-11-10T02:00:00Z', false, false],
    ['Sunday 10:00 EST', '2026-11-08T15:00:00Z', false, false],
    ['Tuesday 03:59 EST', '2026-11-10T08:59:00Z', false, false]
  ])('%s', (_label, iso, extended, newsPeak) => {
    const date = new Date(iso);
    expect(isExtendedHoursSession(date)).toBe(extended);
    expect(isNewsPeakWindow(date)).toBe(newsPeak);
  });

  test.each([
    ['during Monday session -> Friday 20:00 EST', '2026-11-09T15:00:00Z', '2026-11-07T01:00:00.000Z'],
    ['Monday after 20:00 -> same day', '2026-11-10T01:30:00Z', '2026-11-10T01:00:00.000Z'],
    ['Sunday -> Friday 20:00 EST', '2026-11-08T15:00:00Z', '2026-11-07T01:00:00.000Z'],
    ['summer weekend -> Friday 20:00 EDT', '2026-07-05T12:00:00Z', '2026-07-04T00:00:00.000Z'],
    ['Sunday after spring-forward -> Friday 20:00 EST', '2026-03-09T03:00:00Z', '2026-03-07T01:00:00.000Z']
  ])('last close %s', (_label, iso, expected) => {
    expect(lastExtendedSessionClose(new Date(iso)).toISOString()).toBe(expected);
  });
});
