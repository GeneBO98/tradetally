jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/notificationService', () => ({}));

const AchievementService = require('../../src/services/achievementService');

const DAY = 86400;

// entry ages in days before now
const snapshot = ({ analysisDaysAgo, revengeDaysAgo = null, tradeDaysAgo = [] }) => ({
  trades: tradeDaysAgo.map(d => ({ entry_age_seconds: d * DAY })),
  misc: {
    revenge_analysis_age_seconds: analysisDaysAgo === null ? null : analysisDaysAgo * DAY,
    latest_analyzed_revenge_age_seconds: revengeDaysAgo === null ? null : revengeDaysAgo * DAY
  }
});

describe('AchievementService no-revenge evaluation', () => {
  it('does not award without a revenge analysis run', () => {
    expect(AchievementService.evaluateNoRevengeTrades(
      snapshot({ analysisDaysAgo: null, tradeDaysAgo: [1, 20] }), 7
    )).toBe(false);
  });

  it('awards a clean analyzed week with trading activity', () => {
    expect(AchievementService.evaluateNoRevengeTrades(
      snapshot({ analysisDaysAgo: 0, tradeDaysAgo: [1, 3, 20] }), 7
    )).toEqual({ earned: true, metadata: { days_clean: 7, trades_during_period: 2 } });
  });

  it('does not award when a revenge event falls inside the window', () => {
    expect(AchievementService.evaluateNoRevengeTrades(
      snapshot({ analysisDaysAgo: 0, revengeDaysAgo: 4, tradeDaysAgo: [1, 3, 20] }), 7
    )).toBe(false);
  });

  it('awards when the only revenge event is older than the window', () => {
    expect(AchievementService.evaluateNoRevengeTrades(
      snapshot({ analysisDaysAgo: 0, revengeDaysAgo: 12, tradeDaysAgo: [1, 3, 20] }), 7
    )).toEqual({ earned: true, metadata: { days_clean: 7, trades_during_period: 2 } });
  });

  it('requires the user to have been trading for the whole window', () => {
    expect(AchievementService.evaluateNoRevengeTrades(
      snapshot({ analysisDaysAgo: 0, tradeDaysAgo: [1, 3] }), 7
    )).toBe(false);
  });

  it('requires a trade during the window', () => {
    expect(AchievementService.evaluateNoRevengeTrades(
      snapshot({ analysisDaysAgo: 0, tradeDaysAgo: [10, 40] }), 7
    )).toBe(false);
  });

  it('anchors the window at the analysis time, not now', () => {
    // Analysis ran 10 days ago; trades 12 and 30 days ago are in/before its window
    expect(AchievementService.evaluateNoRevengeTrades(
      snapshot({ analysisDaysAgo: 10, tradeDaysAgo: [2, 12, 30] }), 7
    )).toEqual({ earned: true, metadata: { days_clean: 7, trades_during_period: 1 } });
  });
});
