// Real-Postgres integration test for TradeQueries.getAnalytics. The unit
// suite asserts SQL strings; this suite executes the real SQL, including the
// whole-trade position grouping mode from issue #339 (the SNOW bull put
// example: two legs, +684.37 and -477.62, must count as ONE winning trade
// when grouping is on and two trades / 50% win rate when off).
const { randomUUID } = require('crypto');

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');

async function createTestUser() {
  const suffix = randomUUID().slice(0, 8);
  const result = await db.query(
    `INSERT INTO users (email, username, password_hash, is_verified, is_active, admin_approved, role)
     VALUES ($1, $2, 'integration-test-hash', true, true, true, 'user')
     RETURNING *`,
    [`int-analytics-${suffix}@example.com`, `int_analytics_${suffix}`]
  );
  const user = result.rows[0];
  await db.query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);
  return user;
}

async function insertOptionLeg(userId, overrides = {}) {
  const leg = {
    symbol: 'SNOW260116P00400000',
    underlying_symbol: 'SNOW',
    instrument_type: 'option',
    option_type: 'put',
    strike_price: 400,
    expiration_date: '2026-01-16',
    side: 'long',
    quantity: 1,
    entry_price: 5,
    exit_price: 6,
    entry_time: '2026-01-02T15:00:00Z',
    exit_time: '2026-01-05T15:00:00Z',
    trade_date: '2026-01-02',
    pnl: 100,
    commission: 0,
    fees: 0,
    account_identifier: 'ACC1',
    ...overrides
  };

  await db.query(
    `INSERT INTO trades (
       user_id, symbol, underlying_symbol, instrument_type, option_type,
       strike_price, expiration_date, side, quantity, entry_price, exit_price,
       entry_time, exit_time, trade_date, pnl, commission, fees, account_identifier
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      userId, leg.symbol, leg.underlying_symbol, leg.instrument_type, leg.option_type,
      leg.strike_price, leg.expiration_date, leg.side, leg.quantity, leg.entry_price,
      leg.exit_price, leg.entry_time, leg.exit_time, leg.trade_date, leg.pnl,
      leg.commission, leg.fees, leg.account_identifier
    ]
  );
}

describe('TradeQueries.getAnalytics (real database)', () => {
  let user;

  beforeAll(async () => {
    user = await createTestUser();

    // The SNOW bull put spread from issue #339: one winning short leg, one
    // losing long leg, opened at the same time in the same account.
    await insertOptionLeg(user.id, {
      symbol: 'SNOW260116P00400000',
      side: 'short',
      strike_price: 400,
      pnl: 684.37
    });
    await insertOptionLeg(user.id, {
      symbol: 'SNOW260116P00395000',
      side: 'long',
      strike_price: 395,
      pnl: -477.62
    });
  });

  afterAll(async () => {
    if (user) {
      await db.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
    await db.pool.end();
  });

  test('per-leg mode counts each leg as a trade', async () => {
    const analytics = await TradeQueries.getAnalytics(user.id, {});

    expect(analytics.summary.totalTrades).toBe(2);
    expect(analytics.summary.winningTrades).toBe(1);
    expect(analytics.summary.losingTrades).toBe(1);
    expect(analytics.summary.winRate).toBeCloseTo(50, 1);
    expect(analytics.summary.totalPnL).toBeCloseTo(206.75, 2);

    // Daily Win Rate & P/R widget data follows per-leg counting.
    expect(analytics.dailyWinRate).toHaveLength(1);
    expect(parseInt(analytics.dailyWinRate[0].total_trades)).toBe(2);
    expect(parseInt(analytics.dailyWinRate[0].wins)).toBe(1);
  });

  test('whole-trade mode collapses the spread into one winning position', async () => {
    await db.query(
      'UPDATE user_settings SET analytics_position_grouping = true WHERE user_id = $1',
      [user.id]
    );

    const analytics = await TradeQueries.getAnalytics(user.id, {});

    expect(analytics.summary.totalTrades).toBe(1);
    expect(analytics.summary.winningTrades).toBe(1);
    expect(analytics.summary.losingTrades).toBe(0);
    expect(analytics.summary.winRate).toBeCloseTo(100, 1);
    // Total P&L is identical in both modes.
    expect(analytics.summary.totalPnL).toBeCloseTo(206.75, 2);

    // The grouped daily win rate (issue #339 follow-up) counts one position.
    expect(analytics.dailyWinRate).toHaveLength(1);
    expect(parseInt(analytics.dailyWinRate[0].total_trades)).toBe(1);
    expect(parseInt(analytics.dailyWinRate[0].wins)).toBe(1);

    // Symbol breakdown rolls both legs up under the underlying.
    const snowRow = analytics.performanceBySymbol.find(row => row.symbol === 'SNOW');
    expect(snowRow).toBeDefined();
    expect(parseInt(snowRow.trades)).toBe(1);
    expect(parseInt(snowRow.wins)).toBe(1);

    await db.query(
      'UPDATE user_settings SET analytics_position_grouping = false WHERE user_id = $1',
      [user.id]
    );
  });
});
