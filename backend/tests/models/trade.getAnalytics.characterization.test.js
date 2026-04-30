// Characterization tests for TradeQueries.getAnalytics
//
// These tests pin the WHERE-clause + parameter-array behavior of the unified
// trade-query module. They began as characterization tests of Trade.getAnalytics
// before the Phase-B extraction.
//
// getAnalytics fans out into 7 parallel db.query calls via Promise.all, all
// sharing the same `values` array. We assert on the first call's params (the
// executionCountQuery) since they are identical across the fan-out.
//
// Post-Phase-B (TradeQueries extraction): drift between getTrades and
// getAnalytics has been deliberately resolved. Tests below were updated to
// reflect the unified behavior:
//   - broker filter applies ONCE (was twice in old getAnalytics)
//   - symbol prefix includes CUSIP fallback (was missing)
//   - sector filter uses EXISTS subquery (unified across both callers)
//   - single-value `strategy` uses time-range mapping via Trade.getStrategyFilter
//   - filter param order follows the unified builder, which matches the old
//     findByUser ordering (symbol → dates → importId → ...)
// Sample-data exclusion remains intentionally off for analytics.

jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn().mockResolvedValue('America/New_York'),
  getUserLocalDate: jest.fn()
}));

jest.mock('../../src/services/achievementService', () => ({}));

jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn().mockResolvedValue({ statistics_calculation: 'average' })
}));

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');

// Default mock for all 7 fan-out queries: minimal shapes that satisfy
// downstream processing without affecting WHERE-clause assertions.
function defaultDbResponse() {
  return {
    rowCount: 0,
    rows: [
      {
        execution_count: 0,
        total_trades: 0,
        winning_trades: 0,
        losing_trades: 0,
        breakeven_trades: 0,
        total_pnl: 0,
        total_costs: 0,
        avg_pnl: 0,
        avg_win: 0,
        avg_loss: 0,
        best_trade: 0,
        worst_trade: 0,
        win_rate: 0,
        profit_factor: 0,
        sharpe_ratio: 0,
        max_drawdown: 0,
        max_daily_gain: 0,
        max_daily_loss: 0,
        symbols_traded: 0,
        trading_days: 0,
        avg_return_pct: 0,
        avg_r_value: 0
      }
    ]
  };
}

function captureValues() {
  expect(db.query).toHaveBeenCalled();
  // All 7 fan-out queries share the same values array. Use the first call.
  return db.query.mock.calls[0][1];
}

function captureSql() {
  // Use the executionCountQuery (first call) — it's the simplest and contains
  // the WHERE clause only. Other queries embed the same WHERE clause.
  return db.query.mock.calls[0][0];
}

describe('TradeQueries.getAnalytics characterization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue(defaultDbResponse());
  });

  describe('baseline', () => {
    test('no filters: only user_id binding', async () => {
      await TradeQueries.getAnalytics('user-1', {});
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1']);
      expect(sql).toContain('WHERE t.user_id = $1');
      // getAnalytics intentionally does NOT exclude sample data
      expect(sql).not.toContain("NOT COALESCE('sample' = ANY(t.tags), false)");
    });

    test('all 7 fan-out queries receive identical values', async () => {
      await TradeQueries.getAnalytics('user-1', { startDate: '2026-01-01', endDate: '2026-01-31' });
      expect(db.query).toHaveBeenCalledTimes(7);
      const allValues = db.query.mock.calls.map(c => c[1]);
      // Every call gets the same params array reference (or equal values).
      const first = allValues[0];
      for (const v of allValues) {
        expect(v).toEqual(first);
      }
    });
  });

  describe('symbol filtering', () => {
    test('prefix mode: ILIKE plus CUSIP fallback (unified with findByUser)', async () => {
      await TradeQueries.getAnalytics('user-1', { symbol: 'aapl' });
      const sql = captureSql();
      const values = captureValues();
      expect(values).toEqual(['user-1', 'AAPL']);
      expect(sql).toContain("t.symbol ILIKE $2 || '%'");
      // Post-unification: analytics now resolves CUSIP-symbol trades via the
      // same fallback as findByUser. Behavior change vs. pre-Phase-B.
      expect(sql).toContain('cusip_mappings');
    });

    test('exact mode: UPPER equality', async () => {
      await TradeQueries.getAnalytics('user-1', { symbol: 'aapl', symbolExact: true });
      const sql = captureSql();
      expect(sql).toContain('UPPER(t.symbol) = $2');
    });
  });

  describe('date filtering', () => {
    test('start + end: trade_date OR exit_time::date in range', async () => {
      await TradeQueries.getAnalytics('user-1', {
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', '2026-01-01', '2026-01-31']);
      expect(sql).toContain('t.trade_date >= $2 AND t.trade_date <= $3');
      expect(sql).toContain('t.exit_time::date >= $2 AND t.exit_time::date <= $3');
    });

    test('start only', async () => {
      await TradeQueries.getAnalytics('user-1', { startDate: '2026-01-01' });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', '2026-01-01']);
      expect(sql).toContain('t.trade_date >= $2 OR t.exit_time::date >= $2');
    });
  });

  describe('broker filtering — applies once (post-unification)', () => {
    test('broker (single): equality, applied once', async () => {
      await TradeQueries.getAnalytics('user-1', { broker: 'schwab' });
      const sql = captureSql();
      const values = captureValues();
      expect(values).toEqual(['user-1', 'schwab']);
      const equalityMatches = sql.match(/t\.broker = \$\d+/g) || [];
      expect(equalityMatches.length).toBe(1);
    });

    test('brokers (multi): ANY clause emitted once', async () => {
      await TradeQueries.getAnalytics('user-1', { brokers: 'schwab,ibkr' });
      const sql = captureSql();
      const values = captureValues();
      expect(values).toEqual(['user-1', ['schwab', 'ibkr']]);
      expect(sql).toContain('t.broker = ANY($2::text[])');
      // Old getAnalytics also emitted a duplicate `t.broker IN (...)` block;
      // unified builder no longer does.
      expect(sql).not.toContain('t.broker IN (');
    });
  });

  describe('multi-select filters', () => {
    test('strategies: IN with placeholders', async () => {
      await TradeQueries.getAnalytics('user-1', { strategies: ['breakout', 'pullback'] });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', 'breakout', 'pullback']);
      expect(sql).toContain('t.strategy IN ($2,$3)');
    });

    test('strategy (single, when strategies not set): time-range mapping', async () => {
      // Post-unification: single `strategy` value maps to a hold-time range
      // via Trade.getStrategyFilter (e.g., 'breakout' → 15min-8hr profitable).
      // For tag-based equality, callers should pass `strategies: [name]`.
      await TradeQueries.getAnalytics('user-1', { strategy: 'breakout' });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1']);
      expect(sql).toContain('EXTRACT(EPOCH FROM');
      expect(sql).not.toContain('t.strategy = $');
    });

    test('strategies takes precedence over strategy', async () => {
      await TradeQueries.getAnalytics('user-1', { strategies: ['breakout'], strategy: 'pullback' });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', 'breakout']);
      expect(sql).toContain('t.strategy IN ($2)');
      // No equality block, no time-range block (strategy single is suppressed
      // when strategies multi-select is present)
      expect(sql).not.toContain('t.strategy = $');
      expect(sql).not.toContain('EXTRACT(EPOCH FROM');
    });

    test('sectors (multi): EXISTS subquery (unified with findByUser)', async () => {
      await TradeQueries.getAnalytics('user-1', { sectors: ['Technology', 'Healthcare'] });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', 'Technology', 'Healthcare']);
      // Unified shape: EXISTS subquery on symbol_categories
      expect(sql).toContain('EXISTS (SELECT 1 FROM symbol_categories sc WHERE sc.symbol = t.symbol AND sc.finnhub_industry IN ($2,$3))');
    });

    test('sector (single): EXISTS subquery shape', async () => {
      await TradeQueries.getAnalytics('user-1', { sector: 'Technology' });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', 'Technology']);
      expect(sql).toContain('EXISTS (SELECT 1 FROM symbol_categories sc WHERE sc.symbol = t.symbol AND sc.finnhub_industry = $2)');
    });

    test('instrumentTypes: IN with placeholders', async () => {
      await TradeQueries.getAnalytics('user-1', { instrumentTypes: ['stock', 'option'] });
      const sql = captureSql();
      expect(sql).toContain('t.instrument_type IN ($2,$3)');
    });

    test('qualityGrades: IN with placeholders', async () => {
      await TradeQueries.getAnalytics('user-1', { qualityGrades: ['A', 'B'] });
      const sql = captureSql();
      expect(sql).toContain('t.quality_grade IN ($2,$3)');
    });

    test('tags: array overlap', async () => {
      await TradeQueries.getAnalytics('user-1', { tags: ['breakout'] });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', ['breakout']]);
      expect(sql).toContain('t.tags && $2');
    });
  });

  describe('account filtering', () => {
    test('regular accounts: IN with placeholders', async () => {
      await TradeQueries.getAnalytics('user-1', { accounts: ['ACCT-1', 'ACCT-2'] });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', 'ACCT-1', 'ACCT-2']);
      expect(sql).toContain('t.account_identifier IN ($2,$3)');
    });

    test('__unsorted__ sentinel: IS NULL or empty, no params', async () => {
      await TradeQueries.getAnalytics('user-1', { accounts: ['__unsorted__'] });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1']);
      expect(sql).toContain("t.account_identifier IS NULL OR t.account_identifier = ''");
    });
  });

  describe('range filters', () => {
    test('price range: ignores empty string', async () => {
      await TradeQueries.getAnalytics('user-1', { minPrice: 10, maxPrice: '' });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', 10]);
      expect(sql).toContain('t.entry_price >= $2');
      expect(sql).not.toContain('t.entry_price <= $3');
    });

    test('quantity range: both bounds set', async () => {
      await TradeQueries.getAnalytics('user-1', { minQuantity: 100, maxQuantity: 10000 });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', 100, 10000]);
      expect(sql).toContain('t.quantity >= $2');
      expect(sql).toContain('t.quantity <= $3');
    });

    test('pnl range: ignores null', async () => {
      await TradeQueries.getAnalytics('user-1', { minPnl: null, maxPnl: 1000 });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', 1000]);
      expect(sql).not.toContain('t.pnl >= ');
      expect(sql).toContain('t.pnl <= $2');
    });
  });

  describe('status / pnlType / boolean filters', () => {
    test('status closed', async () => {
      await TradeQueries.getAnalytics('user-1', { status: 'closed' });
      const sql = captureSql();
      expect(sql).toContain('t.exit_price IS NOT NULL');
    });

    test('pnlType profit: also accepts "positive"', async () => {
      await TradeQueries.getAnalytics('user-1', { pnlType: 'positive' });
      const sql = captureSql();
      expect(sql).toContain('t.pnl > 0');
    });

    test('pnlType loss: also accepts "negative"', async () => {
      await TradeQueries.getAnalytics('user-1', { pnlType: 'negative' });
      const sql = captureSql();
      expect(sql).toContain('t.pnl < 0');
    });

    test('pnlType breakeven: getAnalytics-only filter (not in findByUser)', async () => {
      await TradeQueries.getAnalytics('user-1', { pnlType: 'breakeven' });
      const sql = captureSql();
      expect(sql).toContain('t.pnl = 0');
    });

    test('hasNews=true', async () => {
      await TradeQueries.getAnalytics('user-1', { hasNews: 'true' });
      const sql = captureSql();
      expect(sql).toContain('t.has_news = true');
    });

    test('hasNews=false: false OR NULL', async () => {
      await TradeQueries.getAnalytics('user-1', { hasNews: 'false' });
      const sql = captureSql();
      expect(sql).toContain('t.has_news = false OR t.has_news IS NULL');
    });

    test('hasRValue=true', async () => {
      await TradeQueries.getAnalytics('user-1', { hasRValue: 'true' });
      const sql = captureSql();
      expect(sql).toContain('t.stop_loss IS NOT NULL');
    });

    test('side', async () => {
      await TradeQueries.getAnalytics('user-1', { side: 'long' });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', 'long']);
      expect(sql).toContain('t.side = $2');
    });
  });

  describe('timezone-aware days of week', () => {
    test('daysOfWeek: extract dow with timezone', async () => {
      await TradeQueries.getAnalytics('user-1', { daysOfWeek: [1, 2] });
      const values = captureValues();
      const sql = captureSql();
      expect(values).toEqual(['user-1', 1, 2, 'America/New_York']);
      expect(sql).toContain('extract(dow from (t.entry_time AT TIME ZONE $4)) IN ($2,$3)');
    });
  });

  describe('importId', () => {
    test('importId: equality (positioned after symbol post-unification)', async () => {
      await TradeQueries.getAnalytics('user-1', { importId: 'import-123', symbol: 'aapl' });
      const values = captureValues();
      const sql = captureSql();
      // Unified builder follows findByUser order: symbol → dates → importId
      expect(values).toEqual(['user-1', 'AAPL', 'import-123']);
      expect(sql).toContain('t.import_id = $3');
      expect(sql).toContain("t.symbol ILIKE $2 || '%'");
    });
  });

  describe('combinations', () => {
    test('symbol + dates + tags + qualityGrades: param order pinned', async () => {
      await TradeQueries.getAnalytics('user-1', {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        symbol: 'aapl',
        tags: ['breakout'],
        qualityGrades: ['A']
      });
      const values = captureValues();
      // Unified builder order: symbol → dates → tags → qualityGrades
      expect(values).toEqual([
        'user-1',
        'AAPL',
        '2026-01-01',
        '2026-01-31',
        ['breakout'],
        'A'
      ]);
    });

    test('all 7 queries called with full filter combo', async () => {
      await TradeQueries.getAnalytics('user-1', {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        accounts: ['ACCT-1']
      });
      expect(db.query).toHaveBeenCalledTimes(7);
    });
  });
});
