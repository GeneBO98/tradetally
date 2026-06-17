// Regression test for issue #345: dollar-based stop-loss users were seeing a
// NEGATIVE aggregate "Net R" on the dashboard even though their net P&L was
// positive.
//
// Root cause: the dashboard derived each trade's R from its stored stop loss
// (pnl / ((entry-stop) * qty * multiplier)). For a fixed-dollar-risk trader
// that denominator is supposed to be the same dollars on every trade, but in
// practice stored stops are inconsistent:
//   - winners whose stop was trailed to/above breakeven produce a NULL risk
//     (the SQL requires stop_loss < entry for longs) and drop out entirely,
//   - losers with a tight/unrepaired stored stop get a tiny denominator and a
//     huge negative R.
// The sum then skews negative. A fixed-dollar-risk trader's R is simply
// net P&L / dollar risk, so the aggregate must reconcile to totalPnL / risk.
const { randomUUID } = require('crypto');

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');

const DOLLAR_RISK = 500;

async function createDollarRiskUser() {
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
    [user.id, DOLLAR_RISK]
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

  beforeAll(async () => {
    user = await createDollarRiskUser();

    // Winner, stop correctly at the $500 default (100 - 5.00).
    await insertStockTrade(user.id, {
      symbol: 'WIN1', entry_price: 100, stop_loss: 95, exit_price: 110, pnl: 1000,
      trade_date: '2026-01-02', entry_time: '2026-01-02T15:00:00Z', exit_time: '2026-01-02T16:00:00Z'
    });
    // Winner whose stop was trailed ABOVE entry to lock in profit. Price-based
    // risk is NULL here, so the old derivation dropped this winning R entirely.
    await insertStockTrade(user.id, {
      symbol: 'WIN2', entry_price: 100, stop_loss: 102, exit_price: 115, pnl: 1500,
      trade_date: '2026-01-03', entry_time: '2026-01-03T15:00:00Z', exit_time: '2026-01-03T16:00:00Z'
    });
    // Loser with a tight/unrepaired stored stop ($50 risk). The old derivation
    // gave this a -40R denominator blow-up that dominated the sum.
    await insertStockTrade(user.id, {
      symbol: 'LOSE1', entry_price: 100, stop_loss: 99.5, exit_price: 80, pnl: -2000,
      trade_date: '2026-01-04', entry_time: '2026-01-04T15:00:00Z', exit_time: '2026-01-04T16:00:00Z'
    });
  });

  afterAll(async () => {
    if (user) {
      await db.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
    await db.pool.end();
  });

  test('aggregate Net R reconciles to net P&L / dollar risk and stays positive', async () => {
    const analytics = await TradeQueries.getAnalytics(user.id, {});

    // Net P&L = 1000 + 1500 - 2000 = +500 (positive).
    expect(analytics.summary.totalPnL).toBeCloseTo(500, 2);

    // Net R for a fixed-dollar-risk trader = net P&L / dollar risk = 500/500 = +1R.
    expect(analytics.summary.totalRValue).toBeCloseTo(500 / DOLLAR_RISK, 2);
    expect(analytics.summary.totalRValue).toBeGreaterThan(0);

    // Average R = average net P&L / dollar risk over the 3 completed trades.
    expect(analytics.summary.avgRValue).toBeCloseTo((500 / 3) / DOLLAR_RISK, 2);
  });

  test('daily cumulative R reconciles to cumulative P&L / dollar risk', async () => {
    const analytics = await TradeQueries.getAnalytics(user.id, {});
    const daily = analytics.dailyPnL;

    const lastDay = daily[daily.length - 1];
    const cumulativePnl = daily.reduce((sum, d) => sum + parseFloat(d.daily_pnl || 0), 0);
    expect(parseFloat(lastDay.cumulative_r_value)).toBeCloseTo(cumulativePnl / DOLLAR_RISK, 2);
    expect(parseFloat(lastDay.cumulative_r_value)).toBeGreaterThan(0);
  });
});
