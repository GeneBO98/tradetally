jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/tierService', () => ({ isBillingEnabled: jest.fn() }));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const LeaderboardService = require('../../src/services/leaderboardService');

describe('LeaderboardService consistency metric', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TierService.isBillingEnabled.mockResolvedValue(false);
    db.query.mockResolvedValue({ rows: [] });
  });

  test('uses repeatability components instead of position volume', async () => {
    await LeaderboardService.calculateTradingConsistency({ period_type: 'all_time' });

    const query = db.query.mock.calls[0][0];

    expect(query).toContain('AVG(t.pnl) as avg_pnl');
    expect(query).toContain('AVG(ABS(t.pnl)) as avg_abs_pnl');
    expect(query).toContain('STDDEV_SAMP(t.pnl) as pnl_stddev');
    expect(query).toContain('profit_factor');
    expect(query).toContain('expectancy_score');
    expect(query).toContain('stability_score');
    expect(query).toContain('sample_confidence');
    expect(query).toContain('WHEN avg_pnl <= 0 THEN 0');
    expect(query).not.toContain('avg_volume');
    expect(query).not.toContain('t.quantity * t.entry_price');
    expect(query).not.toMatch(/LIMIT\s+100/i);
  });

  test('applies leaderboard date filters to consistency calculations', async () => {
    await LeaderboardService.calculateTradingConsistency({ period_type: 'monthly' });

    const query = db.query.mock.calls[0][0];

    expect(query).toContain("AND t.exit_time >= date_trunc('month', CURRENT_DATE)");
  });
});


describe('LeaderboardService leaderboard limits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TierService.isBillingEnabled.mockResolvedValue(false);
  });

  test('includes all opted-in traders in saved leaderboard calculations', async () => {
    TierService.isBillingEnabled.mockResolvedValue(true);

    await expect(LeaderboardService.getParticipantFilter('u')).resolves.toBe('1=1');
  });

  test('does not add a SQL limit when all rankings are requested', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'leaderboard-1', key: 'total_pnl' }] })
      .mockResolvedValueOnce({ rows: [] });

    await LeaderboardService.getLeaderboard('total_pnl', 'user-1', 0);

    const entriesQuery = db.query.mock.calls[1][0];
    expect(entriesQuery).not.toMatch(/LIMIT\s+\d+/i);
  });

  test('keeps numeric SQL limits for leaderboard previews', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'leaderboard-1', key: 'total_pnl' }] })
      .mockResolvedValueOnce({ rows: [] });

    await LeaderboardService.getLeaderboard('total_pnl', 'user-1', 5);

    const entriesQuery = db.query.mock.calls[1][0];
    expect(entriesQuery).toMatch(/LIMIT 5/);
  });
});
