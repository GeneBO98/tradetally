/**
 * Regression coverage for the Webull Connect API payload -> TradeTally trade mapping layer.
 *
 * Pins the behavior of:
 *  - fetchExecutions (order-history combo wrappers -> flattened orders with account tagging,
 *    cursor pagination, 2-year look-back clamp)
 *  - mapExecutionToFill (single order -> normalized fill; status/instrument filtering)
 *  - mapExecutionsToTrades / pairFillsToTrades from OAuthBrokerBase (fills -> trades)
 *  - normalizeTokenResponse (Webull's rt_expires_in refresh-token TTL)
 */

process.env.WEBULL_REQUEST_SPACING_MS = '0';

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
const webullService = require('../../src/services/brokerSync/webullService');

/** Builds a Webull order the way fetchExecutions emits them. */
function wbOrder(order, accountNumber = 'A123456789') {
  return {
    status: 'FILLED',
    instrument_type: 'EQUITY',
    ...order,
    _accountId: 'LOJOQITOD49R6G9BPQM489CISA',
    _accountNumber: String(accountNumber)
  };
}

describe('Webull fetchExecutions (order history flattening + pagination)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('flattens combo wrappers, tags orders with account info, and passes the date window', async () => {
    const order = {
      client_order_id: 'CO-1',
      order_id: 'WB-1001',
      symbol: 'MSFT',
      side: 'BUY',
      status: 'FILLED',
      instrument_type: 'EQUITY',
      filled_quantity: '100',
      filled_price: '410.25',
      filled_time_at: '2026-03-06T14:31:00Z'
    };

    axios.get
      .mockResolvedValueOnce({
        data: [{ account_id: 'ACC-1', account_number: '5567892936', account_type: 'MARGIN' }]
      })
      .mockResolvedValueOnce({
        data: [{ client_order_id: 'CO-1', combo_type: 'NORMAL', orders: [order] }]
      });

    const executions = await webullService.fetchExecutions('token-1', {}, {
      startDate: '2026-03-01',
      endDate: '2026-03-07'
    });

    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      symbol: 'MSFT',
      side: 'BUY',
      _accountId: 'ACC-1',
      _accountNumber: '5567892936'
    });

    const accountCall = axios.get.mock.calls[0];
    expect(accountCall[0]).toContain('/oauth-openapi/account/list');
    expect(accountCall[1].headers.Authorization).toBe('Bearer token-1');

    const historyCall = axios.get.mock.calls[1];
    expect(historyCall[0]).toContain('/oauth-openapi/trade/order/history');
    expect(historyCall[1].params).toEqual({
      account_id: 'ACC-1',
      start_date: '2026-03-01',
      end_date: '2026-03-07',
      page_size: 100
    });
  });

  test('clamps the start date to the 2-year look-back window Webull supports', async () => {
    axios.get
      .mockResolvedValueOnce({ data: [{ account_id: 'ACC-1', account_number: '5567892936' }] })
      .mockResolvedValueOnce({ data: [] });

    await webullService.fetchExecutions('token-1', {}, { startDate: '2015-01-01' });

    const historyCall = axios.get.mock.calls[1];
    const twoYearFloor = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(historyCall[1].params.start_date).toBe(twoYearFloor);
  });

  test('paginates with last_client_order_id until a short page is returned', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      client_order_id: `CO-${i}`,
      orders: [{
        client_order_id: `CO-${i}`,
        order_id: `WB-${i}`,
        symbol: 'AAPL',
        side: 'BUY',
        status: 'FILLED',
        filled_quantity: '1',
        filled_price: '100',
        filled_time_at: '2026-03-06T14:31:00Z'
      }]
    }));
    const lastPage = [{
      client_order_id: 'CO-LAST',
      orders: [{
        client_order_id: 'CO-LAST',
        order_id: 'WB-LAST',
        symbol: 'AAPL',
        side: 'SELL',
        status: 'FILLED',
        filled_quantity: '1',
        filled_price: '101',
        filled_time_at: '2026-03-06T15:31:00Z'
      }]
    }];

    axios.get
      .mockResolvedValueOnce({ data: [{ account_id: 'ACC-1', account_number: '5567892936' }] })
      .mockResolvedValueOnce({ data: fullPage })
      .mockResolvedValueOnce({ data: lastPage });

    const executions = await webullService.fetchExecutions('token-1', {}, { startDate: '2026-03-01' });

    expect(executions).toHaveLength(101);
    expect(axios.get).toHaveBeenCalledTimes(3);
    const secondHistoryCall = axios.get.mock.calls[2];
    expect(secondHistoryCall[1].params.last_client_order_id).toBe('CO-99');
  });
});

describe('Webull mapExecutionToFill (single order mapping)', () => {
  test('maps a filled buy order field-by-field', () => {
    const fill = webullService.mapExecutionToFill(wbOrder({
      client_order_id: 'CO-1',
      order_id: 'WB-1001',
      symbol: 'MSFT',
      side: 'BUY',
      filled_quantity: '100',
      filled_price: '410.25',
      filled_time_at: '2026-03-06T14:31:00Z'
    }));

    expect(fill).toEqual({
      symbol: 'MSFT',
      action: 'buy',
      quantity: 100,
      price: 410.25,
      time: '2026-03-06T14:31:00Z',
      commission: 0,
      fees: 0,
      instrumentType: 'stock',
      accountIdentifier: '****6789',
      orderId: 'WB-1001'
    });
  });

  test('maps sides: BUY -> buy; SELL and SHORT -> sell', () => {
    const base = (side) => webullService.mapExecutionToFill(wbOrder({
      order_id: `WB-${side}`,
      symbol: 'AMD',
      side,
      filled_quantity: '10',
      filled_price: '150',
      filled_time_at: '2026-03-06T15:00:00Z'
    }));

    expect(base('BUY').action).toBe('buy');
    expect(base('SELL').action).toBe('sell');
    expect(base('SHORT').action).toBe('sell');
  });

  test('only FILLED and PARTIAL_FILLED orders become fills', () => {
    const withStatus = (status) => webullService.mapExecutionToFill(wbOrder({
      order_id: 'WB-1',
      symbol: 'AMD',
      side: 'BUY',
      status,
      filled_quantity: '10',
      filled_price: '150',
      filled_time_at: '2026-03-06T15:00:00Z'
    }));

    expect(withStatus('FILLED')).not.toBeNull();
    expect(withStatus('PARTIAL_FILLED')).not.toBeNull();
    expect(withStatus('PENDING')).toBeNull();
    expect(withStatus('SUBMITTED')).toBeNull();
    expect(withStatus('CANCELLED')).toBeNull();
    expect(withStatus('FAILED')).toBeNull();
  });

  test('OPTION orders map as option; STOCK/EQUITY/CRYPTO as stock; FUTURES and EVENT are skipped', () => {
    const withInstrument = (instrument_type) => webullService.mapExecutionToFill(wbOrder({
      order_id: 'WB-1',
      symbol: 'XYZ',
      side: 'BUY',
      instrument_type,
      filled_quantity: '1',
      filled_price: '5',
      filled_time_at: '2026-03-06T15:00:00Z'
    }));

    expect(withInstrument('OPTION').instrumentType).toBe('option');
    expect(withInstrument('EQUITY').instrumentType).toBe('stock');
    // The docs' example payload uses STOCK even though the enum says EQUITY
    expect(withInstrument('STOCK').instrumentType).toBe('stock');
    expect(withInstrument('CRYPTO').instrumentType).toBe('stock');
    expect(withInstrument('FUTURES')).toBeNull();
    expect(withInstrument('EVENT')).toBeNull();
  });

  test('falls back to epoch-ms filled_time when filled_time_at is missing, and client_order_id when order_id is missing', () => {
    const fill = webullService.mapExecutionToFill(wbOrder({
      client_order_id: 'CO-9',
      symbol: 'NVDA',
      side: 'SELL',
      filled_quantity: '10',
      filled_price: '90.5',
      filled_time: '1772289060000' // 2026-02-28T14:31:00Z
    }));

    expect(fill).toMatchObject({
      symbol: 'NVDA',
      action: 'sell',
      time: new Date(1772289060000).toISOString(),
      orderId: 'CO-9'
    });
  });

  test('returns null when symbol, quantity, price, or time is missing', () => {
    const valid = {
      order_id: 'WB-1',
      symbol: 'MSFT',
      side: 'BUY',
      filled_quantity: '100',
      filled_price: '410.25',
      filled_time_at: '2026-03-06T14:31:00Z'
    };

    expect(webullService.mapExecutionToFill(wbOrder({ ...valid, symbol: undefined }))).toBeNull();
    expect(webullService.mapExecutionToFill(wbOrder({ ...valid, filled_quantity: '0' }))).toBeNull();
    expect(webullService.mapExecutionToFill(wbOrder({ ...valid, filled_price: '0' }))).toBeNull();
    expect(webullService.mapExecutionToFill(wbOrder({ ...valid, filled_time_at: undefined, place_time_at: undefined }))).toBeNull();
  });
});

describe('Webull mapExecutionsToTrades (fills -> trades)', () => {
  test('stock round trip: buy then sell produces one long trade tagged broker webull', () => {
    const trades = webullService.mapExecutionsToTrades([
      wbOrder({
        order_id: 'WB-1001',
        symbol: 'MSFT',
        side: 'BUY',
        filled_quantity: '100',
        filled_price: '410.25',
        filled_time_at: '2026-03-06T14:31:00Z'
      }),
      wbOrder({
        order_id: 'WB-1002',
        symbol: 'MSFT',
        side: 'SELL',
        filled_quantity: '100',
        filled_price: '414.75',
        filled_time_at: '2026-03-06T20:55:00Z'
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'MSFT',
      side: 'long',
      quantity: 100,
      entryPrice: 410.25,
      exitPrice: 414.75,
      entryTime: '2026-03-06T14:31:00Z',
      exitTime: '2026-03-06T20:55:00Z',
      tradeDate: '2026-03-06',
      pnl: 450,
      broker: 'webull',
      instrumentType: 'stock',
      accountIdentifier: '****6789'
    });
  });

  test('short round trip: SHORT then BUY is detected as a short trade with correct P&L', () => {
    const trades = webullService.mapExecutionsToTrades([
      wbOrder({
        order_id: 'WB-2001',
        symbol: 'AMD',
        side: 'SHORT',
        filled_quantity: '50',
        filled_price: '30.5',
        filled_time_at: '2026-03-09T14:10:00Z'
      }),
      wbOrder({
        order_id: 'WB-2002',
        symbol: 'AMD',
        side: 'BUY',
        filled_quantity: '50',
        filled_price: '29.5',
        filled_time_at: '2026-03-09T17:45:00Z'
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      side: 'short',
      entryPrice: 30.5,
      exitPrice: 29.5,
      tradeDate: '2026-03-09',
      pnl: 50,
      broker: 'webull'
    });
  });

  test('option round trip applies the 100x contract multiplier to P&L', () => {
    const trades = webullService.mapExecutionsToTrades([
      wbOrder({
        order_id: 'WB-OPT-1',
        symbol: 'SPY260618C00500000',
        side: 'BUY',
        instrument_type: 'OPTION',
        filled_quantity: '2',
        filled_price: '3.5',
        filled_time_at: '2026-06-01T14:35:00Z'
      }),
      wbOrder({
        order_id: 'WB-OPT-2',
        symbol: 'SPY260618C00500000',
        side: 'SELL',
        instrument_type: 'OPTION',
        filled_quantity: '2',
        filled_price: '4.25',
        filled_time_at: '2026-06-01T19:10:00Z'
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      instrumentType: 'option',
      quantity: 2,
      pnl: 150 // (4.25 - 3.5) * 2 * 100
    });
  });

  test('unfilled orders in the payload are ignored during pairing', () => {
    const trades = webullService.mapExecutionsToTrades([
      wbOrder({
        order_id: 'WB-1',
        symbol: 'AAPL',
        side: 'BUY',
        filled_quantity: '10',
        filled_price: '100',
        filled_time_at: '2026-03-06T14:30:00Z'
      }),
      wbOrder({
        order_id: 'WB-2',
        symbol: 'AAPL',
        side: 'SELL',
        status: 'CANCELLED',
        filled_quantity: '0',
        filled_price: '0',
        filled_time_at: '2026-03-06T15:30:00Z'
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      side: 'long',
      exitPrice: null,
      pnl: null
    });
  });
});

describe('Webull normalizeTokenResponse (rt_expires_in handling)', () => {
  test('maps Webull string token fields and derives refreshTokenExpiresAt from rt_expires_in', () => {
    const before = Date.now();
    const tokens = webullService.normalizeTokenResponse({
      access_token: 'MDM2VTFF',
      token_type: 'Bearer',
      expires_in: '1800',
      refresh_token: 'UkVGUkVTSA',
      rt_expires_in: '1296000'
    });
    const after = Date.now();

    expect(tokens.accessToken).toBe('MDM2VTFF');
    expect(tokens.refreshToken).toBe('UkVGUkVTSA');
    expect(tokens.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 1800 * 1000);
    expect(tokens.expiresAt.getTime()).toBeLessThanOrEqual(after + 1800 * 1000);
    expect(tokens.refreshTokenExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 1296000 * 1000);
    expect(tokens.refreshTokenExpiresAt.getTime()).toBeLessThanOrEqual(after + 1296000 * 1000);
  });

  test('keeps the previous refresh token if the response omits one', () => {
    const tokens = webullService.normalizeTokenResponse(
      { access_token: 'NEW', expires_in: '1800' },
      'OLD-REFRESH'
    );
    expect(tokens.refreshToken).toBe('OLD-REFRESH');
  });
});
