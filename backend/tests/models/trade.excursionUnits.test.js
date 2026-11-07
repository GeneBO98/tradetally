jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn().mockResolvedValue('UTC'),
  getUserLocalDate: jest.fn().mockResolvedValue('2026-10-15')
}));
jest.mock('../../src/services/achievementService', () => ({
  checkAndAwardAchievements: jest.fn().mockResolvedValue([]),
  updateTradingStreak: jest.fn().mockResolvedValue(null)
}));
jest.mock('../../src/services/optionStrategyGroupingService', () => ({ rebuildUserGroupsSafe: jest.fn() }));
const db = require('../../src/config/database');
const Trade = require('../../src/models/Trade');
const User = require('../../src/models/User');
const contracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

function persisted(sql, params, field) {
  if (sql.includes('INSERT INTO trades')) {
    const columns = sql.match(/INSERT INTO trades\s*\(([\s\S]*?)\)/)[1].split(',').map(column => column.trim());
    return params[columns.indexOf(field)];
  }
  const placeholder = sql.match(new RegExp(`\\b${field} = \\$(\\d+)`));
  return placeholder ? params[Number(placeholder[1]) - 1] : undefined;
}

describe('trade excursion unit persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(User, 'getSettings').mockResolvedValue({});
    db.query.mockResolvedValue({ rows: [{ id: 'trade-1', symbol: 'AAPL' }] });
  });
  afterEach(() => jest.restoreAllMocks());

  test.each(contracts.excursion_unit_cases)('$id creates and updates in points or R while storing dollars', async fixture => {
    const t = fixture.trade;
    const data = {
      symbol: t.symbol, side: t.side, instrumentType: t.instrument_type, quantity: t.quantity,
      entryPrice: t.entry_price, entryTime: '2026-10-15T14:00:00Z',
      stopLoss: t.stop_loss, takeProfit: t.entry_price + 20,
      pointValue: t.point_value, contractSize: t.contract_size,
      ...(t.instrument_type === 'option' ? { strikePrice: 100, expirationDate: '2026-12-18', optionType: 'call', underlyingSymbol: 'AAPL' } : {})
    };
    for (const unit of ['points', 'r']) {
      await Trade.create('user-1', { ...data, excursion_unit: unit, mae: 0, mfe: fixture[unit], post_exit_mfe: fixture[unit] }, {
        skipApiCalls: true, skipStrategyClassification: true
      });
      const [sql, params] = db.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO trades')).at(-1);
      expect(persisted(sql, params, 'mae')).toBe(0);
      expect(persisted(sql, params, 'mfe')).toBe(fixture.dollars);
      expect(persisted(sql, params, 'post_exit_mfe')).toBe(fixture.dollars);
      const spy = jest.spyOn(Trade, 'findById').mockResolvedValue({ ...t, id: 'trade-1', user_id: 'user-1', take_profit: 120, manual_override: true, executions: [], strike_price: 100, expiration_date: '2026-12-18', option_type: 'call', underlying_symbol: 'AAPL' });
      await Trade.update('trade-1', 'user-1', { excursion_unit: unit, mae: 0, mfe: fixture[unit], post_exit_mfe: fixture[unit] }, { skipAchievements: true, skipOptionGrouping: true });
      const [update_sql, update_params] = db.query.mock.calls.filter(([sql]) => sql.includes('UPDATE trades')).at(-1);
      expect(persisted(update_sql, update_params, 'mae')).toBe(0);
      expect(persisted(update_sql, update_params, 'mfe')).toBe(fixture.dollars);
      expect(persisted(update_sql, update_params, 'post_exit_mfe')).toBe(fixture.dollars);
      expect(update_sql).not.toContain('excursion_unit');
      expect(update_sql.match(/post_exit_mfe =/g)).toHaveLength(1);
      spy.mockRestore();
    }
  });

  test('uses updated quantity and stop when converting an R edit', async () => {
    jest.spyOn(Trade, 'findById').mockResolvedValue({
      id: 'trade-1', user_id: 'user-1', symbol: 'AAPL', side: 'long', instrument_type: 'stock',
      entry_price: 100, entry_time: '2026-10-15T14:00:00Z', quantity: 10,
      stop_loss: 98, take_profit: 110, manual_override: true, executions: []
    });
    await Trade.update('trade-1', 'user-1', { quantity: 20, stopLoss: 97, excursion_unit: 'r', mfe: 2 }, { skipAchievements: true });
    const [sql, params] = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE trades'));
    expect(persisted(sql, params, 'mfe')).toBe(120);
  });
});
