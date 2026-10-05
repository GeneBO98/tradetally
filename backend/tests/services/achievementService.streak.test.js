jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/notificationService', () => ({}));

const AchievementService = require('../../src/services/achievementService');

const snapshot = (dates) => ({ trades: dates.map(entry_date => ({ entry_date })) });

describe('AchievementService trading streak', () => {
  it('counts consecutive weekdays', () => {
    // Tue, Wed, Thu
    expect(AchievementService.longestTradingStreak(['2026-09-15', '2026-09-16', '2026-09-17'])).toBe(3);
  });

  it('does not break a streak over a weekend', () => {
    // Thu, Fri, Mon
    expect(AchievementService.longestTradingStreak(['2026-09-17', '2026-09-18', '2026-09-21'])).toBe(3);
  });

  it('counts weekend trading days inside a run', () => {
    // Fri, Sat, Mon
    expect(AchievementService.longestTradingStreak(['2026-09-18', '2026-09-19', '2026-09-21'])).toBe(3);
  });

  it('breaks on a skipped weekday', () => {
    // Mon, Tue, Thu, Fri, Mon
    expect(AchievementService.longestTradingStreak([
      '2026-09-14', '2026-09-15', '2026-09-17', '2026-09-18', '2026-09-21'
    ])).toBe(3);
  });

  it('dedupes multiple trades on the same day and ignores order', () => {
    expect(AchievementService.longestTradingStreak([
      '2026-09-16', '2026-09-15', '2026-09-15', null, '2026-09-14'
    ])).toBe(3);
  });

  it('returns 0 for no trades', () => {
    expect(AchievementService.longestTradingStreak([])).toBe(0);
  });

  it('awards the achievement once the required days are met', () => {
    expect(AchievementService.evaluateTradingStreak(
      snapshot(['2026-09-17', '2026-09-18', '2026-09-21']), 3
    )).toEqual({ earned: true, metadata: { streak_length: 3, required_days: 3 } });
  });

  it('does not award when the streak is too short', () => {
    expect(AchievementService.evaluateTradingStreak(snapshot(['2026-09-17', '2026-09-18']), 3)).toBe(false);
  });
});
