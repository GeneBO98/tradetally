// Regression coverage for dollar-based default stops on dashboard analytics.
// Valid stored stops define each trade's R; the configured dollar amount is a
// fallback only when a trailed stop no longer defines positive risk.
const { randomUUID } = require('crypto');

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');
const calculationContracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

const DOLLAR_RISK = 500;

async function createDollarRiskUser(defaultDollarRisk = DOLLAR_RISK) {
  const suffix = randomUUID().slice(0, 8);
  const result = await db.query(
    `INSERT INTO users (email, username, password_hash, is_verified, is_active, admin_approved, role)
     VALUES ($1, $2, 'integration-test-hash', true, true, true, 'user')
     RETURNING *`,
    [`int-dollar-r-${suffix}@example.com`, `int_dollar_r_${suffix}`]
  );
  const user = result.rows[0];
  await db.query(
    `INSERT INTO user_settings (user_id, default_stop_loss_type, default_stop_loss_dollars, default_stop_loss_percent)
     VALUES ($1, 'dollar', $2, 5)
     ON CONFLICT (user_id) DO UPDATE
       SET default_stop_loss_type = 'dollar',
           default_stop_loss_dollars = $2,
           default_stop_loss_percent = 5`,
    [user.id, defaultDollarRisk]
  );
  return user;
}

async function insertStockTrade(userId, overrides = {}) {
  const t = {
    symbol: 'AAA',
    instrument_type: 'stock',
    side: 'long',
    quantity: 100,
    entry_price: 100,
    exit_price: 110,
    stop_loss: 95,
    entry_time: '2026-01-02T15:00:00Z',
    exit_time: '2026-01-02T16:00:00Z',
    trade_date: '2026-01-02',
    pnl: 1000,
    commission: 0,
    fees: 0,
    account_identifier: 'ACC1',
    ...overrides
  };

  await db.query(
    `INSERT INTO trades (
       user_id, symbol, instrument_type, side, quantity, entry_price, exit_price,
       stop_loss, entry_time, exit_time, trade_date, pnl, commission, fees, account_identifier
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      userId, t.symbol, t.instrument_type, t.side, t.quantity, t.entry_price,
      t.exit_price, t.stop_loss, t.entry_time, t.exit_time, t.trade_date, t.pnl,
      t.commission, t.fees, t.account_identifier
    ]
  );
}

describe('TradeQueries.getAnalytics dollar-risk R (#345)', () => {
  let user;
  let screenshotUser;

  beforeAll(async () => {
    user = await createDollarRiskUser();

    // Winner, stop correctly at the $500 default (100 - 5.00).
    await insertStockTrade(user.id, {
      symbol: 'ALPHA', entry_price: 100, stop_loss: 95, exit_price: 110, pnl: 1000,
      trade_date: '2026-01-02', entry_time: '2026-01-02T15:00:00Z', exit_time: '2026-01-02T16:00:00Z'
    });
    // Winner whose stop was trailed ABOVE entry to lock in profit. Price-based
    // risk is NULL here, so the old derivation dropped this winning R entirely.
    await insertStockTrade(user.id, {
      symbol: 'BRAVO', entry_price: 100, stop_loss: 102, exit_price: 115, pnl: 1500,
      trade_date: '2026-01-03', entry_time: '2026-01-03T15:00:00Z', exit_time: '2026-01-03T16:00:00Z'
    });
    // Loser with a tight, valid stored stop ($50 risk). The explicit stop must
    // take precedence over the user's $500 default.
    await insertStockTrade(user.id, {
      symbol: 'CHARLIE', entry_price: 100, stop_loss: 99.5, exit_price: 80, pnl: -2000,
      trade_date: '2026-01-04', entry_time: '2026-01-04T15:00:00Z', exit_time: '2026-01-04T16:00:00Z'
    });

    const fixture = calculationContracts.r_value.dollar_default_explicit_stop_example;
    screenshotUser = await createDollarRiskUser(fixture.default_stop_loss_dollars);
    await insertStockTrade(screenshotUser.id, {
      ...fixture.trade,
      account_identifier: 'SCREENSHOT',
      trade_date: '2026-07-28',
      entry_time: '2026-07-28T15:12:00Z',
      exit_time: '2026-07-28T16:00:00Z'
    });
  });

  afterAll(async () => {
    if (user) {
      await db.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
    if (screenshotUser) {
      await db.query('DELETE FROM users WHERE id = $1', [screenshotUser.id]);
    }
    await db.pool.end();
  });

  test('aggregate Net R uses valid stops and falls back for a stop beyond entry', async () => {
    const analytics = await TradeQueries.getAnalytics(user.id, {});

    // Net P&L = 1000 + 1500 - 2000 = +500 (positive).
    expect(analytics.summary.totalPnL).toBeCloseTo(500, 2);

    // ALPHA uses its valid $500 stop risk (+2R), BRAVO falls back to the $500
    // default because its stop is above entry (+3R), and CHARLIE uses its valid
    // tight $50 stop risk (-40R).
    expect(analytics.summary.totalRValue).toBeCloseTo(-35, 2);

    expect(analytics.summary.avgRValue).toBeCloseTo(-35 / 3, 2);
  });

  test('daily cumulative R uses the same stop-first precedence', async () => {
    const analytics = await TradeQueries.getAnalytics(user.id, {});
    const daily = analytics.dailyPnL;

    const lastDay = daily[daily.length - 1];
    expect(parseFloat(lastDay.cumulative_r_value)).toBeCloseTo(-35, 2);
  });

  test('dashboard reproduces the reported explicit-stop risk calculation', async () => {
    const fixture = calculationContracts.r_value.dollar_default_explicit_stop_example;
    const analytics = await TradeQueries.getAnalytics(screenshotUser.id, {});

    expect(analytics.summary.totalPnL).toBeCloseTo(fixture.trade.pnl, 2);
    expect(analytics.summary.totalRValue).toBeCloseTo(fixture.expected.dashboard_r, 2);
    expect(analytics.summary.avgRValue).toBeCloseTo(fixture.expected.dashboard_r, 2);

    const lastDay = analytics.dailyPnL[analytics.dailyPnL.length - 1];
    expect(parseFloat(lastDay.cumulative_r_value)).toBeCloseTo(fixture.expected.dashboard_r, 2);
  });
});
