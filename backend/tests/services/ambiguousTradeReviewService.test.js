jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({
  create: jest.fn()
}));

jest.mock('../../src/services/analyticsCache', () => ({
  invalidate: jest.fn()
}));

jest.mock('../../src/services/optionStrategyGroupingService', () => ({
  rebuildUserGroupsSafe: jest.fn()
}));

const db = require('../../src/config/database');
const Trade = require('../../src/models/Trade');
const AnalyticsCache = require('../../src/services/analyticsCache');
const OptionStrategyGroupingService = require('../../src/services/optionStrategyGroupingService');
const {
  applyManualReviewDecisions,
  buildTradeForDecision
} = require('../../src/services/ambiguousTradeReviewService');

const reviewItem = {
  review_type: 'ambiguous_sell_only_stock',
  broker: 'ibkr',
  broker_connection_id: 'conn-1',
  import_id: 'import-1',
  symbol: 'IBKR',
  conid: '43645865',
  order_id: '9349469033',
  action: 'sell',
  quantity: 0.0228,
  price: 81.67,
  commission: 0.018663565,
  datetime: '2026-04-20T10:25:08',
  trade_date: '2026-04-20',
  account_identifier: 'U123'
};

describe('ambiguousTradeReviewService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('builds an open short trade when the user confirms the sell-only execution was short', () => {
    const trade = buildTradeForDecision(reviewItem, 'import_as_short');

    expect(trade).toMatchObject({
      symbol: 'IBKR',
      side: 'short',
      quantity: 0.0228,
      entryPrice: 81.67,
      exitPrice: null,
      broker: 'ibkr',
      brokerConnectionId: 'conn-1',
      importId: 'import-1',
      accountIdentifier: 'U123',
      conid: '43645865',
      instrumentType: 'stock'
    });
    expect(trade.executions).toEqual([
      expect.objectContaining({
        action: 'sell',
        quantity: 0.0228,
        price: 81.67,
        commission: 0.018663565,
        fees: 0,
        orderId: '9349469033',
        manual_review_action: 'import_as_short'
      })
    ]);
  });

  test('builds a close-only long trade when the user chooses close-only', () => {
    const trade = buildTradeForDecision(reviewItem, 'import_as_close_only');

    expect(trade).toMatchObject({
      symbol: 'IBKR',
      side: 'long',
      quantity: 0.0228,
      entryPrice: 81.67,
      exitPrice: 81.67,
      entryTime: '2026-04-20T10:25:08',
      exitTime: '2026-04-20T10:25:08'
    });
    expect(trade.executions).toHaveLength(2);
    expect(trade.executions[0]).toMatchObject({
      action: 'buy',
      synthetic: true,
      synthetic_reason: 'manual_review_missing_opening_execution'
    });
    expect(trade.executions[1]).toMatchObject({
      action: 'sell',
      orderId: '9349469033',
      manual_review_action: 'import_as_close_only'
    });
  });

  test('builds a zero-basis gifted shares trade for broker reward lots', () => {
    const trade = buildTradeForDecision(reviewItem, 'import_as_gifted_shares');

    expect(trade).toMatchObject({
      symbol: 'IBKR',
      side: 'long',
      quantity: 0.0228,
      entryPrice: 0,
      exitPrice: 81.67,
      entryTime: '2026-04-20T10:25:08',
      exitTime: '2026-04-20T10:25:08'
    });
    expect(trade.pnl).toBeCloseTo((81.67 * 0.0228) - 0.018663565, 8);
    expect(trade.executions).toHaveLength(2);
    expect(trade.executions[0]).toMatchObject({
      action: 'buy',
      price: 0,
      synthetic: true,
      synthetic_reason: 'manual_review_gifted_shares_zero_basis'
    });
    expect(trade.executions[1]).toMatchObject({
      action: 'sell',
      price: 81.67,
      orderId: '9349469033',
      manual_review_action: 'import_as_gifted_shares'
    });
  });

  test('applies review decisions and refreshes derived trade data when imports are created', async () => {
    db.query.mockResolvedValue({ rows: [] });
    Trade.create.mockResolvedValue({ id: 'trade-1' });

    const result = await applyManualReviewDecisions('user-1', [
      { action: 'import_as_short', item: reviewItem },
      { action: 'ignore', item: { ...reviewItem, order_id: 'ignore-me' } }
    ]);

    expect(Trade.create).toHaveBeenCalledTimes(1);
    expect(Trade.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        symbol: 'IBKR',
        side: 'short'
      }),
      expect.objectContaining({
        skipAchievements: true,
        skipApiCalls: true,
        skipOptionGrouping: true
      })
    );
    expect(OptionStrategyGroupingService.rebuildUserGroupsSafe).toHaveBeenCalledWith('user-1', 'manual trade review');
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith('user-1');
    expect(result).toMatchObject({
      imported: 1,
      ignored: 1,
      duplicates: 0,
      failed: 0
    });
  });
});
