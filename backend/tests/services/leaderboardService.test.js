jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn()
  }
}));

jest.mock('../../src/services/behavioralAnalyticsService', () => ({}));
jest.mock('../../src/services/tierService', () => ({
  isBillingEnabled: jest.fn(async () => false),
  getUserTier: jest.fn(async () => 'free')
}));

const db = require('../../src/config/database');
const LeaderboardService = require('../../src/services/leaderboardService');

function createClient() {
  return {
    query: jest.fn(),
    release: jest.fn()
  };
}

describe('LeaderboardService.saveLeaderboardEntries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses one pool client for the full delete/generate/insert transaction', async () => {
    const client = createClient();
    db.pool.connect.mockResolvedValue(client);
    client.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.startsWith('DELETE FROM leaderboard_entries')) return { rowCount: 1 };
      if (sql.startsWith('SELECT generate_anonymous_name')) {
        return { rows: [{ name: 'Trader Alpha' }] };
      }
      if (sql.includes('INSERT INTO leaderboard_entries')) return { rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await LeaderboardService.saveLeaderboardEntries('leaderboard-1', [{
      user_id: 'user-1',
      score: 42,
      metadata: { pnl: 42 }
    }]);

    expect(db.pool.connect).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'DELETE FROM leaderboard_entries WHERE leaderboard_id = $1 AND DATE(recorded_at) = CURRENT_DATE',
      'SELECT generate_anonymous_name($1) as name',
      expect.stringContaining('INSERT INTO leaderboard_entries'),
      'COMMIT'
    ]);
    expect(client.query.mock.calls[1][1]).toEqual(['leaderboard-1']);
    expect(client.query.mock.calls[2][1]).toEqual(['user-1']);
    expect(client.query.mock.calls[3][1]).toEqual([
      'leaderboard-1',
      'user-1',
      'Trader Alpha',
      42,
      1,
      { pnl: 42 }
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('rolls back and releases the same client when an insert fails', async () => {
    const client = createClient();
    db.pool.connect.mockResolvedValue(client);
    client.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN') return { rows: [] };
      if (sql.startsWith('DELETE FROM leaderboard_entries')) return { rowCount: 1 };
      if (sql.startsWith('SELECT generate_anonymous_name')) {
        return { rows: [{ name: 'Trader Alpha' }] };
      }
      if (sql.includes('INSERT INTO leaderboard_entries')) {
        throw new Error('insert failed');
      }
      if (sql === 'ROLLBACK') return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(LeaderboardService.saveLeaderboardEntries('leaderboard-1', [{
      user_id: 'user-1',
      score: 42,
      metadata: {}
    }])).rejects.toThrow('insert failed');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
