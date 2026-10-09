const { randomUUID } = require('crypto');
const db = require('../../src/config/database');
const LeaderboardService = require('../../src/services/leaderboardService');
const contracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

describe('Consistency leaderboard calculation contracts (real Postgres)', () => {
  const user_ids = [];

  afterAll(async () => {
    for (const user_id of user_ids) await db.query('DELETE FROM users WHERE id = $1', [user_id]);
    await db.pool.end();
  });

  test.each(contracts.leaderboard_consistency_cases)('$id', async test_case => {
    const suffix = randomUUID().slice(0, 8);
    const created = await db.query(
      `INSERT INTO users (email, username, password_hash, is_verified, is_active, admin_approved)
       VALUES ($1, $2, 'integration-test-hash', true, true, true) RETURNING id`,
      [`int-consistency-${suffix}@example.com`, `int_consistency_${suffix}`]
    );
    const user_id = created.rows[0].id;
    user_ids.push(user_id);
    await db.query(
      `INSERT INTO trades (user_id, symbol, side, quantity, entry_price, exit_price,
                           entry_time, exit_time, trade_date, pnl, commission, fees)
       SELECT $1, 'AAPL', 'long', 10, 100, 100 + $2 / 10,
              NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', CURRENT_DATE, $2, 0, 0
       FROM generate_series(1, $3::int)`,
      [user_id, test_case.pnl, test_case.trade_count]
    );
    const rows = await LeaderboardService.calculateTradingConsistency({ period_type: 'all_time' });
    const result = rows.find(row => row.user_id === user_id);
    expect(result).toBeDefined();
    expect(Number(result.score)).toBeCloseTo(test_case.expected_score, 2);
    expect(result.metadata.total_trades).toBe(test_case.trade_count);
    expect(result.metadata.total_pnl).toBeCloseTo(test_case.pnl * test_case.trade_count, 2);
  });
});
