const { randomUUID } = require('crypto');

const db = require('../../src/config/database');
const Trade = require('../../src/models/Trade');

describe('public trade query allowlist (real database)', () => {
  let userId;
  let tradeId;

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    const userResult = await db.query(`
      INSERT INTO users (email, username, password_hash, is_verified, is_active, admin_approved, role)
      VALUES ($1, $2, 'integration-test-hash', true, true, true, 'user')
      RETURNING id
    `, [`public-${suffix}@example.com`, `public_${suffix}`]);
    userId = userResult.rows[0].id;

    await db.query(
      'INSERT INTO user_settings (user_id, public_profile) VALUES ($1, true)',
      [userId]
    );

    const tradeResult = await db.query(`
      INSERT INTO trades (
        user_id, symbol, side, quantity, entry_price, trade_date, is_public,
        account_identifier, heart_rate, sleep_score, sleep_hours, stress_level,
        executions, quality_metrics
      ) VALUES (
        $1, 'AAPL', 'long', 10, 100, '2026-01-02', true,
        'PRIVATE-ACCOUNT', 80, 90, 8, 2,
        '[{"price":100}]'::jsonb, '{"internal":true}'::jsonb
      ) RETURNING id
    `, [userId]);
    tradeId = tradeResult.rows[0].id;
  });

  afterAll(async () => {
    if (userId) await db.query('DELETE FROM users WHERE id = $1', [userId]);
    await db.pool.end();
  });

  test('executes the explicit query and omits private columns', async () => {
    const trades = await Trade.getPublicTrades({ viewerUserId: userId, limit: 50 });
    const trade = trades.find(row => row.id === tradeId);

    expect(trade).toBeDefined();
    expect(trade.symbol).toBe('AAPL');
    expect(trade.is_owner).toBe(true);
    expect(trade.avatar_url).toBeNull();
    for (const field of [
      'user_id', 'account_identifier', 'broker_connection_id', 'import_id', 'conid',
      'heart_rate', 'sleep_score', 'sleep_hours', 'stress_level', 'executions',
      'quality_metrics', 'classification_metadata'
    ]) {
      expect(trade).not.toHaveProperty(field);
    }
  });
});
