const { randomUUID } = require('crypto');
const db = require('../../src/config/database');
const { parseCSV } = require('../../src/utils/csvParser');
const grouping = require('../../src/services/optionStrategyGroupingService');
const TradeQueries = require('../../src/services/tradeQueries');
const contracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

let user_id;
beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);
  const result = await db.query(`INSERT INTO users (email, username, password_hash, is_verified, is_active, admin_approved)
    VALUES ($1, $2, 'test', true, true, true) RETURNING id`, [`group-${suffix}@example.com`, `group_${suffix}`]);
  user_id = result.rows[0].id;
  await db.query('INSERT INTO user_settings (user_id, analytics_position_grouping) VALUES ($1, true)', [user_id]);
});
afterEach(async () => {
  await db.query('DELETE FROM trades WHERE user_id = $1', [user_id]);
  await db.query('DELETE FROM trade_position_groups WHERE user_id = $1', [user_id]);
});
afterAll(async () => {
  if (user_id) await db.query('DELETE FROM users WHERE id = $1', [user_id]);
  await db.pool.end();
});

async function save(trade) {
  await db.query(`INSERT INTO trades (user_id, symbol, underlying_symbol, instrument_type, option_type,
    strike_price, expiration_date, side, quantity, entry_price, exit_price, entry_time, exit_time,
    trade_date, pnl, commission, fees, broker, account_identifier, executions)
    VALUES ($1,$2,$3,'option',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'ibkr','TEST',$17::jsonb)`,
  [user_id, trade.symbol, trade.underlyingSymbol, trade.optionType, trade.strikePrice, trade.expirationDate,
    trade.side, trade.quantity, trade.entryPrice, trade.exitPrice, trade.entryTime, trade.exitTime,
    trade.tradeDate, trade.pnl, trade.commission, trade.fees, JSON.stringify(trade.executions)]);
}

test('persisted execution IDs produce four whole-trade positions and preserve aggregate net P&L', async () => {
  const fixture = contracts.ibkr_option_grouping_cases[0];
  const csv = fixture.opening_csv.trimEnd() + '\n' + fixture.closing_csv.split('\n').slice(1).join('\n');
  const parsed = await parseCSV(Buffer.from(csv), 'ibkr', { userTimezone: 'America/New_York' });
  for (const trade of parsed.trades) await save(trade);
  expect(await grouping.rebuildUserGroups(user_id)).toEqual({ groupsCreated: 4, legsGrouped: 16 });
  const before = await db.query('SELECT id FROM trade_position_groups WHERE user_id = $1 ORDER BY id', [user_id]);
  await grouping.rebuildUserGroups(user_id);
  const after = await db.query('SELECT id FROM trade_position_groups WHERE user_id = $1 ORDER BY id', [user_id]);
  expect(after.rows).toEqual(before.rows);
  const analytics = await TradeQueries.getAnalytics(user_id, {});
  expect(analytics.summary.totalTrades).toBe(4);
  expect(analytics.summary.totalPnL).toBeCloseTo(fixture.expected.reduce((sum, item) => sum + item.net_pnl, 0), 2);
});

test('analytics fallback does not merge unmatched known orders at the same timestamp', async () => {
  const fixture = contracts.ibkr_option_grouping_cases[0];
  const csv = fixture.opening_csv.trimEnd() + '\n' + fixture.closing_csv.split('\n').slice(1).join('\n');
  const parsed = await parseCSV(Buffer.from(csv), 'ibkr');
  const legs = parsed.trades.filter(trade => trade.underlyingSymbol === 'COF').slice(0, 2);
  for (const [index, trade] of legs.entries()) {
    trade.executions.forEach(execution => { execution.brokerage_order_id = `separate-${index}`; });
    await save(trade);
  }
  expect(await grouping.rebuildUserGroups(user_id)).toEqual({ groupsCreated: 0, legsGrouped: 0 });
  const analytics = await TradeQueries.getAnalytics(user_id, {});
  expect(analytics.summary.totalTrades).toBe(2);
});
