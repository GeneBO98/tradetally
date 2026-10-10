jest.mock('../../src/services/achievementService', () => ({}));
jest.mock('../../src/services/challengeService', () => ({}));
jest.mock('../../src/services/tierService', () => ({}));
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/leaderboardService', () => ({
  getLeaderboard: jest.fn(),
}));

const LeaderboardService = require('../../src/services/leaderboardService');
const gamificationController = require('../../src/controllers/gamification.controller');

describe('gamificationController leaderboard limit parsing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes limit=all through as an unlimited leaderboard request', async () => {
    LeaderboardService.getLeaderboard.mockResolvedValue({ entries: [] });

    const req = {
      params: { key: 'total_pnl' },
      query: { limit: 'all' },
      user: { id: 'user-1' },
    };
    const res = { json: jest.fn() };
    const next = jest.fn();

    await gamificationController.getLeaderboard(req, res, next);

    expect(LeaderboardService.getLeaderboard).toHaveBeenCalledWith('total_pnl', 'user-1', 0);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { entries: [] },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('falls back to the default limit for invalid limit values', async () => {
    LeaderboardService.getLeaderboard.mockResolvedValue({ entries: [] });

    const req = {
      params: { key: 'total_pnl' },
      query: { limit: 'not-a-number' },
      user: { id: 'user-1' },
    };
    const res = { json: jest.fn() };

    await gamificationController.getLeaderboard(req, res, jest.fn());

    expect(LeaderboardService.getLeaderboard).toHaveBeenCalledWith('total_pnl', 'user-1', 100);
  });
});
