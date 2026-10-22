// Leaderboard filters (strategy / volume / P&L) are Pro-only
// (leaderboard_filters). Free users keep the unfiltered top-10 leaderboards.

jest.mock('../../src/services/achievementService', () => ({}));
jest.mock('../../src/services/challengeService', () => ({}));
jest.mock('../../src/services/tierService', () => ({ isProUser: jest.fn() }));
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/leaderboardService', () => ({
  getParticipantFilter: jest.fn().mockResolvedValue('TRUE'),
  getFilteredUserIds: jest.fn()
}));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const LeaderboardService = require('../../src/services/leaderboardService');
const gamificationController = require('../../src/controllers/gamification.controller');

const FILTER_QUERY = { strategy: 'breakout', minVolume: '1000', minPnl: '50' };

describe('getAllLeaderboards filter gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LeaderboardService.getParticipantFilter.mockResolvedValue('TRUE');
    db.query.mockImplementation(async (sql) => {
      if (/FROM leaderboards/.test(sql)) {
        return { rows: [{ id: 'lb1', key: 'total_pnl', name: 'Total P&L', metric_key: 'pnl', period_type: 'all' }] };
      }
      return { rows: [{ rank: 1, display_name: 'Trader1', value: 100, is_current_user: false }] };
    });
  });

  test('ignores filters for free users and returns the unfiltered leaderboards', async () => {
    TierService.isProUser.mockResolvedValue(false);
    const res = { json: jest.fn() };
    const next = jest.fn();

    await gamificationController.getAllLeaderboards({ user: { id: 'user-1' }, query: FILTER_QUERY }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(LeaderboardService.getFilteredUserIds).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data[0].entries).toHaveLength(1);
  });

  test('applies filters for Pro users', async () => {
    TierService.isProUser.mockResolvedValue(true);
    LeaderboardService.getFilteredUserIds.mockResolvedValue([]);
    const res = { json: jest.fn() };

    await gamificationController.getAllLeaderboards({ user: { id: 'user-1' }, query: FILTER_QUERY }, res, jest.fn());

    expect(LeaderboardService.getFilteredUserIds).toHaveBeenCalledWith({
      strategy: 'breakout',
      minVolume: 1000,
      minPnl: 50
    });
    expect(res.json.mock.calls[0][0].filtered).toBe(true);
  });
});
