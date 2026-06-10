/**
 * Regression coverage for the TradeStation API-payload -> TradeTally trade mapping layer.
 *
 * Pins the behavior of:
 *  - fetchExecutions (orders payload -> flattened execution legs with account tagging)
 *  - mapExecutionToFill (single execution leg -> normalized fill)
 *  - mapExecutionsToTrades / pairFillsToTrades from OAuthBrokerBase (fills -> trades)
 *  - isDuplicateTrade dedupe behavior (field match + orderId match)
 */

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({
  create: jest.fn()
}));

jest.mock('../../src/models/BrokerConnection', () => ({
  updateSyncLog: jest.fn(),
  updateOAuthTokens: jest.fn(),
  updateStatus: jest.fn()
}));

jest.mock('../../src/services/analyticsCache', () => ({
  invalidateUserCache: jest.fn(),
  invalidate: jest.fn()
}));

jest.mock('../../src/utils/cache', () => ({
  data: {},
  del: jest.fn()
}));

jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const axios = require('axios');
const tradestationService = require('../../src/services/brokerSync/tradestationService');

/** Builds a TradeStation execution leg the way fetchExecutions emits them. */
function tsExecution(leg, order, accountId = '11542936') {
  return { ...leg, _order: order, _accountId: String(accountId) };
}

describe('TradeStation fetchExecutions (orders payload flattening)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('flattens order legs, tags each with _order and _accountId, and passes the date window', async () => {
    const order = {
      OrderID: 'TS-1001',
      OpenedDateTime: '2026-03-06T14:31:00Z',
      Legs: [
        { Symbol: 'MSFT', BuyOrSell: 'Buy', Quantity: 100, ExecutionPrice: '410.25', ExecutionTime: '2026-03-06T14:31:00Z' }
      ]
    };

    axios.get
      .mockResolvedValueOnce({ data: { Accounts: [{ AccountID: '11542936' }] } })
      .mockResolvedValueOnce({ data: { Orders: [order] } });

    const executions = await tradestationService.fetchExecutions('token-1', {}, {
      startDate: '2026-03-01',
      endDate: '2026-03-07'
    });

    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      Symbol: 'MSFT',
      BuyOrSell: 'Buy',
      _accountId: '11542936'
    });
    expect(executions[0]._order).toBe(order);

    const ordersCall = axios.get.mock.calls[1];
    expect(ordersCall[0]).toContain('/brokerage/accounts/11542936/orders');
    expect(ordersCall[1].params).toEqual({ since: '2026-03-01', until: '2026-03-07' });
    expect(ordersCall[1].headers.Authorization).toBe('Bearer token-1');
  });

  test('an order without Legs is treated as a single execution', async () => {
    const order = {
      OrderID: 'TS-1002',
      Symbol: 'NVDA',
      BuyOrSell: 'Sell',
      Quantity: 10,
      AveragePrice: 900.5,
      ClosedDateTime: '2026-03-06T15:00:00Z'
    };

    axios.get
      .mockResolvedValueOnce({ data: { Accounts: [{ AccountID: '11542936' }] } })
      .mockResolvedValueOnce({ data: { Orders: [order] } });

    const executions = await tradestationService.fetchExecutions('token-1', {}, {});

    expect(executions).toHaveLength(1);
    expect(executions[0].Symbol).toBe('NVDA');
    expect(executions[0]._order).toBe(order);
  });
});

describe('TradeStation mapExecutionToFill (single execution mapping)', () => {
  test('maps a buy execution leg field-by-field', () => {
    const fill = tradestationService.mapExecutionToFill(tsExecution(
      {
        Symbol: 'MSFT',
        BuyOrSell: 'Buy',
        Quantity: '100',
        ExecutionPrice: '410.25',
        ExecutionTime: '2026-03-06T14:31:00Z',
        Commission: '1.00',
        Fees: '0.12'
      },
      { OrderID: 'TS-1001' }
    ));

    expect(fill).toEqual({
      symbol: 'MSFT',
      action: 'buy',
      quantity: 100,
      price: 410.25,
      time: '2026-03-06T14:31:00Z',
      commission: 1,
      fees: 0.12,
      instrumentType: 'stock',
      accountIdentifier: '****2936',
      orderId: 'TS-1001'
    });
  });

  test('maps order actions: Sell and SellShort -> sell; Buy and BuyToCover -> buy', () => {
    const base = (action) => tradestationService.mapExecutionToFill(tsExecution(
      {
        Symbol: 'AMD',
        BuyOrSell: action,
        Quantity: 10,
        ExecutionPrice: 150,
        ExecutionTime: '2026-03-06T15:00:00Z'
      },
      { OrderID: `TS-${action}` }
    ));

    expect(base('Buy').action).toBe('buy');
    expect(base('Sell').action).toBe('sell');
    expect(base('SellShort').action).toBe('sell');
    expect(base('BuyToCover').action).toBe('buy');
  });

  test('quantity is always positive regardless of sign in the payload', () => {
    const fill = tradestationService.mapExecutionToFill(tsExecution(
      {
        Symbol: 'AMD',
        BuyOrSell: 'Sell',
        Quantity: -25,
        ExecutionPrice: 150,
        ExecutionTime: '2026-03-06T15:00:00Z'
      },
      { OrderID: 'TS-2' }
    ));

    expect(fill.quantity).toBe(25);
    expect(fill.action).toBe('sell');
  });

  test('falls back to FilledQuantity, order AveragePrice, and order timestamps when leg fields are missing', () => {
    const order = {
      OrderID: 9001, // numeric order ID gets stringified
      AveragePrice: 90.5,
      ClosedDateTime: '2026-03-06T15:05:00Z'
    };
    const fill = tradestationService.mapExecutionToFill(tsExecution(
      {
        Symbol: 'NVDA',
        OrderAction: 'SELL',
        FilledQuantity: 10
      },
      order
    ));

    expect(fill).toMatchObject({
      symbol: 'NVDA',
      action: 'sell',
      quantity: 10,
      price: 90.5,
      time: '2026-03-06T15:05:00Z',
      orderId: '9001'
    });
  });

  test('returns null when symbol, quantity, price, or time is missing', () => {
    const valid = {
      Symbol: 'MSFT',
      BuyOrSell: 'Buy',
      Quantity: 100,
      ExecutionPrice: 410.25,
      ExecutionTime: '2026-03-06T14:31:00Z'
    };
    const order = { OrderID: 'TS-1' };

    expect(tradestationService.mapExecutionToFill(tsExecution({ ...valid, Symbol: undefined }, order))).toBeNull();
    expect(tradestationService.mapExecutionToFill(tsExecution({ ...valid, Quantity: 0 }, order))).toBeNull();
    expect(tradestationService.mapExecutionToFill(tsExecution({ ...valid, ExecutionPrice: 0 }, order))).toBeNull();
    expect(tradestationService.mapExecutionToFill(tsExecution({ ...valid, ExecutionTime: undefined }, order))).toBeNull();
  });
});

describe('TradeStation mapExecutionsToTrades (fills -> trades)', () => {
  test('stock round trip: buy then sell produces one long trade with exact fields', () => {
    const trades = tradestationService.mapExecutionsToTrades([
      tsExecution(
        {
          Symbol: 'MSFT',
          BuyOrSell: 'Buy',
          Quantity: 100,
          ExecutionPrice: '410.25',
          ExecutionTime: '2026-03-06T14:31:00Z',
          Commission: '1.00',
          Fees: '0.12'
        },
        { OrderID: 'TS-1001' }
      ),
      tsExecution(
        {
          Symbol: 'MSFT',
          BuyOrSell: 'Sell',
          Quantity: 100,
          ExecutionPrice: '414.75',
          ExecutionTime: '2026-03-06T20:55:00Z',
          Commission: '1.00',
          Fees: '0.10'
        },
        { OrderID: 'TS-1002' }
      )
    ]);

    expect(trades).toHaveLength(1);
    const trade = trades[0];

    expect(trade.symbol).toBe('MSFT');
    expect(trade.side).toBe('long');
    expect(trade.quantity).toBe(100);
    expect(trade.entryPrice).toBe(410.25);
    expect(trade.exitPrice).toBe(414.75);
    // Times pass through verbatim; tradeDate is the exit date with no shift for UTC timestamps
    expect(trade.entryTime).toBe('2026-03-06T14:31:00Z');
    expect(trade.exitTime).toBe('2026-03-06T20:55:00Z');
    expect(trade.tradeDate).toBe('2026-03-06');
    expect(trade.commission).toBe(2); // 1.00 entry + 1.00 exit
    expect(trade.fees).toBeCloseTo(0.22, 10); // 0.12 entry + 0.10 exit
    expect(trade.pnl).toBe(450); // (414.75 - 410.25) * 100
    expect(trade.broker).toBe('tradestation');
    expect(trade.instrumentType).toBe('stock');
    expect(trade.accountIdentifier).toBe('****2936');

    expect(trade.executionData).toEqual([
      {
        action: 'buy',
        type: 'entry',
        quantity: 100,
        price: 410.25,
        datetime: '2026-03-06T14:31:00Z',
        orderId: 'TS-1001'
      },
      {
        action: 'sell',
        type: 'exit',
        quantity: 100,
        price: 414.75,
        datetime: '2026-03-06T20:55:00Z',
        orderId: 'TS-1002'
      }
    ]);
  });

  test('short round trip: SellShort then BuyToCover is detected as a short trade with chronological entry/exit', () => {
    const trades = tradestationService.mapExecutionsToTrades([
      tsExecution(
        {
          Symbol: 'AMD',
          BuyOrSell: 'SellShort',
          Quantity: 50,
          ExecutionPrice: 30.5,
          ExecutionTime: '2026-03-09T14:10:00Z'
        },
        { OrderID: 'TS-2001' }
      ),
      tsExecution(
        {
          Symbol: 'AMD',
          BuyOrSell: 'BuyToCover',
          Quantity: 50,
          ExecutionPrice: 29.5,
          ExecutionTime: '2026-03-09T17:45:00Z'
        },
        { OrderID: 'TS-2002' }
      )
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].symbol).toBe('AMD');
    expect(trades[0].side).toBe('short');
    expect(trades[0].quantity).toBe(50);
    expect(trades[0].broker).toBe('tradestation');

    // Regression (oauthBrokerBase.js pairFillsToTrades): entry/exit used to be
    // picked by buy/sell direction instead of chronology, so the covering BUY
    // became the "entry" — swapped prices, inverted times, tradeDate from the
    // open, and this profitable short (sell 30.50, cover 29.50) reported -50.
    expect(trades[0]).toMatchObject({
      entryPrice: 30.5,
      exitPrice: 29.5,
      entryTime: '2026-03-09T14:10:00Z',
      exitTime: '2026-03-09T17:45:00Z',
      tradeDate: '2026-03-09',
      pnl: 50
    });
  });

  test('out-of-order fills are sorted by time before pairing', () => {
    // Sell arrives first in the payload but executed after the buy
    const trades = tradestationService.mapExecutionsToTrades([
      tsExecution(
        { Symbol: 'AAPL', BuyOrSell: 'Sell', Quantity: 10, ExecutionPrice: 105, ExecutionTime: '2026-03-06T16:00:00Z' },
        { OrderID: 'TS-S' }
      ),
      tsExecution(
        { Symbol: 'AAPL', BuyOrSell: 'Buy', Quantity: 10, ExecutionPrice: 100, ExecutionTime: '2026-03-06T14:30:00Z' },
        { OrderID: 'TS-B' }
      )
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      side: 'long',
      entryPrice: 100,
      exitPrice: 105,
      pnl: 50
    });
  });

  test('partial exit produces a closed trade for the sold quantity and an open trade for the remainder', () => {
    const trades = tradestationService.mapExecutionsToTrades([
      tsExecution(
        { Symbol: 'NVDA', BuyOrSell: 'Buy', Quantity: 100, ExecutionPrice: 50, ExecutionTime: '2026-03-10T14:30:00Z' },
        { OrderID: 'TS-OPEN' }
      ),
      tsExecution(
        { Symbol: 'NVDA', BuyOrSell: 'Sell', Quantity: 40, ExecutionPrice: 52, ExecutionTime: '2026-03-10T15:30:00Z' },
        { OrderID: 'TS-PARTIAL' }
      )
    ]);

    expect(trades).toHaveLength(2);

    const closed = trades.find(t => t.exitPrice !== null);
    const open = trades.find(t => t.exitPrice === null);

    expect(closed).toMatchObject({
      symbol: 'NVDA',
      side: 'long',
      quantity: 40,
      entryPrice: 50,
      exitPrice: 52,
      tradeDate: '2026-03-10',
      pnl: 80
    });

    expect(open).toMatchObject({
      symbol: 'NVDA',
      side: 'long',
      quantity: 60,
      entryPrice: 50,
      exitPrice: null,
      exitTime: null,
      entryTime: '2026-03-10T14:30:00Z',
      tradeDate: '2026-03-10',
      pnl: null
    });
  });

  test('fills in different accounts are never paired with each other', () => {
    const trades = tradestationService.mapExecutionsToTrades([
      tsExecution(
        { Symbol: 'AAPL', BuyOrSell: 'Buy', Quantity: 10, ExecutionPrice: 100, ExecutionTime: '2026-03-06T14:30:00Z' },
        { OrderID: 'TS-A' },
        '11542936'
      ),
      tsExecution(
        { Symbol: 'AAPL', BuyOrSell: 'Sell', Quantity: 10, ExecutionPrice: 105, ExecutionTime: '2026-03-06T15:30:00Z' },
        { OrderID: 'TS-B' },
        '22887700'
      )
    ]);

    expect(trades).toHaveLength(2);
    const sides = trades.map(t => t.side).sort();
    expect(sides).toEqual(['long', 'short']);
    expect(trades.every(t => t.exitPrice === null)).toBe(true);
  });

  test('CURRENT BEHAVIOR: option-style symbols map as stock with no option metadata or 100x multiplier', () => {
    // TradeStation's mapping layer has no option handling: mapExecutionToFill
    // hardcodes instrumentType 'stock'. This pins that behavior; if option
    // support is added, update this test with the new expectations.
    const trades = tradestationService.mapExecutionsToTrades([
      tsExecution(
        { Symbol: 'SPY 260618C500', BuyOrSell: 'Buy', Quantity: 2, ExecutionPrice: 3.5, ExecutionTime: '2026-06-01T14:35:00Z' },
        { OrderID: 'TS-OPT-1' }
      ),
      tsExecution(
        { Symbol: 'SPY 260618C500', BuyOrSell: 'Sell', Quantity: 2, ExecutionPrice: 4.25, ExecutionTime: '2026-06-01T19:10:00Z' },
        { OrderID: 'TS-OPT-2' }
      )
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'SPY 260618C500', // full contract symbol passes through untouched
      instrumentType: 'stock',
      quantity: 2,
      entryPrice: 3.5,
      exitPrice: 4.25,
      pnl: 1.5 // share multiplier (1x), NOT the 100x contract multiplier
    });
    expect(trades[0].optionType).toBeUndefined();
    expect(trades[0].strikePrice).toBeUndefined();
    expect(trades[0].expirationDate).toBeUndefined();
  });
});

describe('TradeStation dedupe behavior (OAuthBrokerBase.isDuplicateTrade)', () => {
  function buildRoundTripTrade() {
    return tradestationService.mapExecutionsToTrades([
      tsExecution(
        { Symbol: 'MSFT', BuyOrSell: 'Buy', Quantity: 100, ExecutionPrice: 410.25, ExecutionTime: '2026-03-06T14:31:00Z' },
        { OrderID: 'TS-1001' }
      ),
      tsExecution(
        { Symbol: 'MSFT', BuyOrSell: 'Sell', Quantity: 100, ExecutionPrice: 414.75, ExecutionTime: '2026-03-06T20:55:00Z' },
        { OrderID: 'TS-1002' }
      )
    ])[0];
  }

  function asExistingRow(trade) {
    return {
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      entry_price: trade.entryPrice,
      exit_price: trade.exitPrice,
      entry_time: trade.entryTime,
      exit_time: trade.exitTime,
      trade_date: trade.tradeDate,
      pnl: trade.pnl,
      instrument_type: trade.instrumentType,
      account_identifier: trade.accountIdentifier,
      executions: trade.executionData
    };
  }

  test('re-syncing the identical payload is flagged as a duplicate, stably', () => {
    const trade = buildRoundTripTrade();
    const existing = [asExistingRow(buildRoundTripTrade())];

    expect(tradestationService.isDuplicateTrade(trade, existing)).toBe(true);
    expect(tradestationService.isDuplicateTrade(trade, existing)).toBe(true);
  });

  test('matches by orderId even when prices were stored slightly differently', () => {
    const trade = buildRoundTripTrade();
    const existing = asExistingRow(buildRoundTripTrade());
    existing.entry_price = 410.3; // field-equality check fails, orderId match still catches it

    expect(tradestationService.isDuplicateTrade(trade, [existing])).toBe(true);
  });

  test('a different fill (different order IDs, prices, quantity) is NOT a duplicate', () => {
    const trade = buildRoundTripTrade();
    const different = asExistingRow(buildRoundTripTrade());
    different.quantity = 40;
    different.entry_price = 409;
    different.exit_price = 412;
    different.executions = [
      { action: 'buy', type: 'entry', quantity: 40, price: 409, datetime: '2026-03-06T14:00:00Z', orderId: 'TS-OTHER-1' },
      { action: 'sell', type: 'exit', quantity: 40, price: 412, datetime: '2026-03-06T15:00:00Z', orderId: 'TS-OTHER-2' }
    ];

    expect(tradestationService.isDuplicateTrade(trade, [different])).toBe(false);
  });
});
