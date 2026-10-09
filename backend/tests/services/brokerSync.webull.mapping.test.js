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
process.env.WEBULL_APP_KEY = 'test-app-key';
process.env.WEBULL_APP_SECRET = 'test-app-secret';

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

describe('Webull token requests', () => {
  beforeEach(() => jest.clearAllMocks());

  test('signs code exchange on the current sandbox endpoint', async () => {
    const previous_environment = process.env.WEBULL_ENVIRONMENT;
    try {
      process.env.WEBULL_ENVIRONMENT = 'uat';
      const service = new webullService.constructor();
      service.config.clientId = 'test-client';
      service.config.clientSecret = 'test-client-secret';
      service.config.redirectUri = 'https://example.com/callback';
      axios.post.mockResolvedValueOnce({ data: { access_token: 'access', refresh_token: 'refresh', expires_in: '1800' } });
      await expect(service.exchangeCodeForTokens('test-code')).resolves.toMatchObject({ accessToken: 'access' });
      const [url, body, options] = axios.post.mock.calls[0];
      expect(url).toBe('https://oauth-open-api.sandbox.webull.com/oauth2/tokens/create');
      const form = Object.fromEntries(new URLSearchParams(body));
      expect(form).toEqual({
        grant_type: 'authorization_code', code: 'test-code', client_id: 'test-client',
        client_secret: 'test-client-secret'
      });
      expect(options.headers).toMatchObject({
        'Content-Type': 'application/x-www-form-urlencoded', 'x-version': 'v2',
        'x-app-key': 'test-app-key', 'x-signature-algorithm': 'HMAC-SHA1'
      });
      const { create_signed_headers } = require('../../src/services/brokerSync/webullSignature');
      expect(options.headers['x-signature']).toBe(create_signed_headers({
        url, params: form, app_key: 'test-app-key', app_secret: 'test-app-secret',
        timestamp: options.headers['x-timestamp'], nonce: options.headers['x-signature-nonce']
      })['x-signature']);
      expect(options.headers['x-signature']).toBeTruthy();
      expect(options.headers).not.toHaveProperty('x-app-secret');
    } finally {
      if (previous_environment === undefined) delete process.env.WEBULL_ENVIRONMENT;
      else process.env.WEBULL_ENVIRONMENT = previous_environment;
    }
  });

  test('also signs refresh and retains the refresh token if Webull omits it', async () => {
    axios.post.mockResolvedValueOnce({ data: { access_token: 'new-access', expires_in: '1800' } });
    await expect(webullService.refreshAccessToken('existing-refresh')).resolves.toMatchObject({ refreshToken: 'existing-refresh' });
    const [, body, options] = axios.post.mock.calls[0];
    expect(Object.fromEntries(new URLSearchParams(body))).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'existing-refresh' });
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(options.headers['x-version']).toBe('v2');
    expect(options.headers['x-signature']).toBeTruthy();
  });

  test('reports the provider error code without copying its response into the error', async () => {
    axios.post.mockRejectedValueOnce({ message: 'Request failed with status code 401', response: {
      status: 401, data: { error_code: 'UNAUTHORIZED', message: 'sensitive response text' }
    } });
    await expect(webullService.exchangeCodeForTokens('test-code')).rejects.toMatchObject({
      message: 'Webull token request rejected: UNAUTHORIZED'
    });
  });

  test('reports dotted Connect error codes returned for invalid authorization codes', async () => {
    axios.post.mockRejectedValueOnce({ message: 'Request failed with status code 417', response: {
      status: 417, data: { error_code: 'token.auth.code.error' }
    } });
    await expect(webullService.exchangeCodeForTokens('test-code')).rejects.toMatchObject({
      message: 'Webull token request rejected: token.auth.code.error'
    });
  });
});

describe('Webull authorization', () => {
  test.each([
    ['uat', '/oauth2/sandbox/authenticate/login'],
    ['prod', '/oauth2/authenticate/login']
  ])('uses the Passport login route for %s', (environment, expected_path) => {
    const previous_environment = process.env.WEBULL_ENVIRONMENT;
    try {
      process.env.WEBULL_ENVIRONMENT = environment;
      const service = new webullService.constructor();
      service.config.clientId = 'test-client';
      service.config.redirectUri = 'https://example.com/callback';
      const url = new URL(service.getAuthorizationUrl('test-state'));
      expect(url.hostname).toBe('passport.webull.com');
      expect(url.pathname).toBe(expected_path);
      expect(url.searchParams.get('state')).toBe('test-state');
      expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/callback');
    } finally {
      if (previous_environment === undefined) delete process.env.WEBULL_ENVIRONMENT;
      else process.env.WEBULL_ENVIRONMENT = previous_environment;
    }
  });
});

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

  const history_contracts = require('../../../tests/fixtures/trading-calculation-contracts.json').webull_history_cases;
  test.each(history_contracts)('$id preserves the round trip across short cursor pages', async contract => {
    axios.get.mockResolvedValueOnce({ data: contract.accounts });
    contract.pages.forEach(page => axios.get.mockResolvedValueOnce({ data: page }));
    const executions = await webullService.fetchExecutions('test-token', {}, {
      startDate: contract.start_date, endDate: contract.end_date
    });
    const trades = webullService.mapExecutionsToTrades(executions);
    expect(trades.map(trade => ({
      symbol: trade.symbol, side: trade.side, quantity: trade.quantity,
      entry_price: trade.entryPrice, exit_price: trade.exitPrice, pnl: trade.pnl,
      commission: trade.commission, fees: trade.fees, account_identifier: trade.accountIdentifier
    }))).toEqual(contract.expected_trades);
    expect(axios.get.mock.calls[2][1].params.pagination_key).toBe('fixture-next-page');
  });

  test('rejects repeated cursors instead of importing an incomplete history', async () => {
    axios.get.mockResolvedValueOnce({ data: [{ account_id: 'fixture-account' }] })
      .mockResolvedValueOnce({ data: { data: [], pagination_key: 'repeat' } })
      .mockResolvedValueOnce({ data: { data: [], pagination_key: 'repeat' } });
    await expect(webullService.fetchExecutions('test-token', {}, { startDate: '2026-03-01' }))
      .rejects.toThrow('repeated pagination key');
    expect(axios.get).toHaveBeenCalledTimes(3);
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
    expect(accountCall[0]).toContain('/trading/accounts/list');
    expect(accountCall[1].headers.Authorization).toBe('Bearer token-1');

    const historyCall = axios.get.mock.calls[1];
    expect(historyCall[0]).toContain('/trading/orders/historical-orders/list');
    expect(historyCall[1].params).toEqual({
      account_id: 'ACC-1',
      start_time: '2026-03-01T00:00:00.000Z',
      end_time: '2026-03-07T23:59:59.999Z'
    });
  });

  test('supports full history back to the documented brokerage start date', async () => {
    axios.get
      .mockResolvedValueOnce({ data: [{ account_id: 'ACC-1', account_number: '5567892936' }] })
      .mockResolvedValueOnce({ data: [] });

    await webullService.fetchExecutions('token-1', {}, { startDate: '2015-01-01' });

    const historyCall = axios.get.mock.calls[1];
    expect(historyCall[1].params.start_time).toBe('2018-05-21T00:00:00.000Z');
  });

  test('paginates using the response pagination key', async () => {
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
      .mockResolvedValueOnce({ data: { data: fullPage, pagination_key: 'next-page' } })
      .mockResolvedValueOnce({ data: { data: lastPage } });

    const executions = await webullService.fetchExecutions('token-1', {}, { startDate: '2026-03-01' });

    expect(executions).toHaveLength(101);
    expect(axios.get).toHaveBeenCalledTimes(3);
    const secondHistoryCall = axios.get.mock.calls[2];
    expect(secondHistoryCall[1].params.pagination_key).toBe('next-page');
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
