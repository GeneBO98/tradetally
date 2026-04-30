// Characterization tests for TradeQueries.findByUser
//
// These tests pin the WHERE-clause + parameter-array behavior of the unified
// trade-query module. They began as characterization tests of Trade.findByUser
// before the Phase-B extraction; the same expectations now apply to
// TradeQueries.findByUser since it preserves findByUser's filter semantics.
//
// Strategy: mock db.query, then assert on:
//   - the params array passed to db.query (exact match)
//   - selected SQL fragments in the query string (substring match)
// The full SQL string is intentionally not snapshotted — formatting/aliasing
// changes during the refactor would create churn without signal.

jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn().mockResolvedValue('America/New_York'),
  getUserLocalDate: jest.fn()
}));

jest.mock('../../src/services/achievementService', () => ({}));

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');

function captureQuery() {
  expect(db.query).toHaveBeenCalledTimes(1);
  return {
    sql: db.query.mock.calls[0][0],
    values: db.query.mock.calls[0][1]
  };
}

describe('TradeQueries.findByUser characterization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
  });

  describe('baseline', () => {
    test('no filters: only user_id binding, sample-data excluded by default', async () => {
      await TradeQueries.findByUser('user-1', {});
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1']);
      expect(sql).toContain('WHERE t.user_id = $1');
      expect(sql).toContain("NOT COALESCE('sample' = ANY(t.tags), false)");
    });

    test('includeSampleData=true: sample-data exclusion is dropped', async () => {
      await TradeQueries.findByUser('user-1', { includeSampleData: true });
      const { sql } = captureQuery();
      expect(sql).not.toContain("NOT COALESCE('sample' = ANY(t.tags), false)");
    });
  });

  describe('symbol filtering', () => {
    test('prefix mode (default): uppercased symbol, ILIKE prefix with CUSIP fallback', async () => {
      await TradeQueries.findByUser('user-1', { symbol: 'aapl' });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'AAPL']);
      expect(sql).toContain("t.symbol ILIKE $2 || '%'");
      expect(sql).toContain('cusip_mappings cm');
    });

    test('exact mode: equality match, no prefix', async () => {
      await TradeQueries.findByUser('user-1', { symbol: 'aapl', symbolExact: true });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'AAPL']);
      expect(sql).toContain('UPPER(t.symbol) = $2');
      expect(sql).not.toContain("ILIKE $2 || '%'");
    });
  });

  describe('date filtering', () => {
    test('start + end: trade_date OR exit_time::date in range', async () => {
      await TradeQueries.findByUser('user-1', {
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', '2026-01-01', '2026-01-31']);
      expect(sql).toContain('t.trade_date >= $2 AND t.trade_date <= $3');
      expect(sql).toContain('t.exit_time::date >= $2 AND t.exit_time::date <= $3');
    });

    test('start only', async () => {
      await TradeQueries.findByUser('user-1', { startDate: '2026-01-01' });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', '2026-01-01']);
      expect(sql).toContain('t.trade_date >= $2 OR t.exit_time::date >= $2');
    });

    test('end only', async () => {
      await TradeQueries.findByUser('user-1', { endDate: '2026-01-31' });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', '2026-01-31']);
      expect(sql).toContain('t.trade_date <= $2 OR t.exit_time::date <= $2');
    });

    test('exitStartDate and exitEndDate: filter on exit_time only', async () => {
      await TradeQueries.findByUser('user-1', {
        exitStartDate: '2026-01-01',
        exitEndDate: '2026-01-31'
      });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', '2026-01-01', '2026-01-31']);
      expect(sql).toContain('t.exit_time::date >= $2');
      expect(sql).toContain('t.exit_time::date <= $3');
    });
  });

  describe('multi-select filters', () => {
    test('strategies: IN with one placeholder per value', async () => {
      await TradeQueries.findByUser('user-1', {
        strategies: ['breakout', 'pullback', 'gap_fill']
      });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'breakout', 'pullback', 'gap_fill']);
      expect(sql).toContain('t.strategy IN ($2,$3,$4)');
    });

    test('sectors: forces sector LEFT JOIN in subquery', async () => {
      await TradeQueries.findByUser('user-1', { sectors: ['Technology', 'Healthcare'] });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'Technology', 'Healthcare']);
      expect(sql).toContain('LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol');
      expect(sql).toContain('sc.finnhub_industry IN ($2,$3)');
    });

    test('sector (single): also forces sector LEFT JOIN', async () => {
      await TradeQueries.findByUser('user-1', { sector: 'Technology' });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'Technology']);
      expect(sql).toContain('sc.finnhub_industry = $2');
    });

    test('instrumentTypes: IN with placeholders', async () => {
      await TradeQueries.findByUser('user-1', { instrumentTypes: ['stock', 'option'] });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'stock', 'option']);
      expect(sql).toContain('t.instrument_type IN ($2,$3)');
    });

    test('optionTypes: IN with placeholders', async () => {
      await TradeQueries.findByUser('user-1', { optionTypes: ['call', 'put'] });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'call', 'put']);
      expect(sql).toContain('t.option_type IN ($2,$3)');
    });

    test('qualityGrades: IN with placeholders', async () => {
      await TradeQueries.findByUser('user-1', { qualityGrades: ['A', 'B'] });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'A', 'B']);
      expect(sql).toContain('t.quality_grade IN ($2,$3)');
    });

    test('tags: array overlap operator', async () => {
      await TradeQueries.findByUser('user-1', { tags: ['mistake', 'emotional'] });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', ['mistake', 'emotional']]);
      expect(sql).toContain('t.tags && $2');
    });
  });

  describe('broker filtering', () => {
    test('brokers (comma-separated string): split, ANY array', async () => {
      await TradeQueries.findByUser('user-1', { brokers: 'schwab, ibkr ,etrade' });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', ['schwab', 'ibkr', 'etrade']]);
      expect(sql).toContain('t.broker = ANY($2::text[])');
    });

    test('broker (single, backwards compat): equality', async () => {
      await TradeQueries.findByUser('user-1', { broker: 'schwab' });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'schwab']);
      expect(sql).toContain('t.broker = $2');
    });

    test('brokers takes precedence over broker when both provided', async () => {
      await TradeQueries.findByUser('user-1', { brokers: 'schwab,ibkr', broker: 'etrade' });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', ['schwab', 'ibkr']]);
      expect(sql).toContain('t.broker = ANY($2::text[])');
      expect(sql).not.toContain('t.broker = $2');
    });
  });

  describe('account filtering', () => {
    test('regular accounts: IN with placeholders', async () => {
      await TradeQueries.findByUser('user-1', { accounts: ['ACCT-1', 'ACCT-2'] });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'ACCT-1', 'ACCT-2']);
      expect(sql).toContain('t.account_identifier IN ($2,$3)');
    });

    test('__unsorted__ sentinel: IS NULL or empty, no params consumed', async () => {
      await TradeQueries.findByUser('user-1', { accounts: ['__unsorted__'] });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1']);
      expect(sql).toContain("t.account_identifier IS NULL OR t.account_identifier = ''");
    });
  });

  describe('range filters', () => {
    test('price range', async () => {
      await TradeQueries.findByUser('user-1', { minPrice: 10, maxPrice: 100 });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 10, 100]);
      expect(sql).toContain('t.entry_price >= $2');
      expect(sql).toContain('t.entry_price <= $3');
    });

    test('quantity range', async () => {
      await TradeQueries.findByUser('user-1', { minQuantity: 100, maxQuantity: 10000 });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 100, 10000]);
      expect(sql).toContain('t.quantity >= $2');
      expect(sql).toContain('t.quantity <= $3');
    });

    test('pnl range', async () => {
      await TradeQueries.findByUser('user-1', { minPnl: -500, maxPnl: 1000 });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', -500, 1000]);
      expect(sql).toContain('t.pnl >= $2');
      expect(sql).toContain('t.pnl <= $3');
    });
  });

  describe('status / pnlType / boolean filters', () => {
    test('status pending: entry_price IS NULL, no params', async () => {
      await TradeQueries.findByUser('user-1', { status: 'pending' });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1']);
      expect(sql).toContain('t.entry_price IS NULL');
    });

    test('status open: entry set and exit not', async () => {
      await TradeQueries.findByUser('user-1', { status: 'open' });
      const { sql } = captureQuery();
      expect(sql).toContain('t.entry_price IS NOT NULL AND t.exit_price IS NULL');
    });

    test('status closed: exit_price IS NOT NULL', async () => {
      await TradeQueries.findByUser('user-1', { status: 'closed' });
      const { sql } = captureQuery();
      expect(sql).toContain('t.exit_price IS NOT NULL');
    });

    test('pnlType profit: t.pnl > 0, no params', async () => {
      await TradeQueries.findByUser('user-1', { pnlType: 'profit' });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1']);
      expect(sql).toContain('t.pnl > 0');
    });

    test('pnlType loss: t.pnl < 0', async () => {
      await TradeQueries.findByUser('user-1', { pnlType: 'loss' });
      const { sql } = captureQuery();
      expect(sql).toContain('t.pnl < 0');
    });

    test('hasNews=true: t.has_news = true', async () => {
      await TradeQueries.findByUser('user-1', { hasNews: 'true' });
      const { sql } = captureQuery();
      expect(sql).toContain('t.has_news = true');
    });

    test('hasNews=false: false OR NULL', async () => {
      await TradeQueries.findByUser('user-1', { hasNews: 'false' });
      const { sql } = captureQuery();
      expect(sql).toContain('t.has_news = false OR t.has_news IS NULL');
    });

    test('hasRValue=true: stop_loss IS NOT NULL', async () => {
      await TradeQueries.findByUser('user-1', { hasRValue: 'true' });
      const { sql } = captureQuery();
      expect(sql).toContain('t.stop_loss IS NOT NULL');
    });

    test('side: equality', async () => {
      await TradeQueries.findByUser('user-1', { side: 'long' });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'long']);
      expect(sql).toContain('t.side = $2');
    });
  });

  describe('timezone-aware days of week', () => {
    test('daysOfWeek: extract dow with user timezone, days then timezone in params', async () => {
      await TradeQueries.findByUser('user-1', { daysOfWeek: [1, 2, 3] });
      const { sql, values } = captureQuery();
      // Days first, then the timezone string at the end
      expect(values).toEqual(['user-1', 1, 2, 3, 'America/New_York']);
      expect(sql).toContain('extract(dow from (t.entry_time AT TIME ZONE $5)) IN ($2,$3,$4)');
    });
  });

  describe('importId', () => {
    test('importId: equality', async () => {
      await TradeQueries.findByUser('user-1', { importId: 'import-123' });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'import-123']);
      expect(sql).toContain('t.import_id = $2');
    });
  });

  describe('pagination', () => {
    test('limit only: appended to subquery', async () => {
      await TradeQueries.findByUser('user-1', { limit: 50 });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 50]);
      expect(sql).toContain('LIMIT $2');
    });

    test('limit + offset: both appended in order', async () => {
      await TradeQueries.findByUser('user-1', { limit: 50, offset: 100 });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 50, 100]);
      expect(sql).toContain('LIMIT $2');
      expect(sql).toContain('OFFSET $3');
    });
  });

  describe('combinations', () => {
    test('symbol + date range + tags: param numbering stays consistent', async () => {
      await TradeQueries.findByUser('user-1', {
        symbol: 'aapl',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        tags: ['breakout']
      });
      const { sql, values } = captureQuery();
      // Order in implementation: symbol, then dates, then tags
      expect(values).toEqual([
        'user-1',
        'AAPL',
        '2026-01-01',
        '2026-01-31',
        ['breakout']
      ]);
      expect(sql).toContain("t.symbol ILIKE $2 || '%'");
      expect(sql).toContain('t.trade_date >= $3 AND t.trade_date <= $4');
      expect(sql).toContain('t.tags && $5');
    });

    test('strategies + accounts + qualityGrades: multi-select params chain', async () => {
      await TradeQueries.findByUser('user-1', {
        strategies: ['breakout'],
        accounts: ['ACCT-1', 'ACCT-2'],
        qualityGrades: ['A']
      });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'breakout', 'ACCT-1', 'ACCT-2', 'A']);
      expect(sql).toContain('t.strategy IN ($2)');
      expect(sql).toContain('t.account_identifier IN ($3,$4)');
      expect(sql).toContain('t.quality_grade IN ($5)');
    });

    test('sectors + limit: sector join present, limit param follows sector params', async () => {
      await TradeQueries.findByUser('user-1', {
        sectors: ['Technology', 'Healthcare'],
        limit: 25
      });
      const { sql, values } = captureQuery();
      expect(values).toEqual(['user-1', 'Technology', 'Healthcare', 25]);
      expect(sql).toContain('LEFT JOIN symbol_categories sc');
      expect(sql).toContain('sc.finnhub_industry IN ($2,$3)');
      expect(sql).toContain('LIMIT $4');
    });
  });

  describe('sample-data exclusion interactions', () => {
    test('default: sample exclusion appears before any user-supplied filters', async () => {
      await TradeQueries.findByUser('user-1', { side: 'long' });
      const { sql } = captureQuery();
      const sampleIdx = sql.indexOf("NOT COALESCE('sample' = ANY(t.tags), false)");
      const sideIdx = sql.indexOf('t.side = $2');
      expect(sampleIdx).toBeGreaterThan(-1);
      expect(sideIdx).toBeGreaterThan(-1);
      expect(sampleIdx).toBeLessThan(sideIdx);
    });
  });
});
