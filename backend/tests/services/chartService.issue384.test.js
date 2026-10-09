const { EventEmitter } = require('events');

jest.mock('https', () => ({ request: jest.fn() }));
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/tierService', () => ({
  getUserTier: async () => 'free',
  isBillingEnabled: async () => false
}));
jest.mock('../../src/utils/finnhub', () => ({
  isCryptoSymbol: () => false,
  isConfigured: jest.fn(),
  getFuturesTradeChartData: jest.fn(),
  displayName: 'Financial Modeling Prep'
}));
jest.mock('../../src/utils/alphaVantage', () => ({ isConfigured: () => false }));

const original_key = process.env.DATABENTO_API_KEY;
const original_yahoo = process.env.YAHOO_FINANCE_ENABLED;
process.env.DATABENTO_API_KEY = 'db-test-key';

// Keep the actual chart, replay, Databento and Yahoo configuration code connected.
// Only external HTTP, persistence, entitlement lookup and the FMP provider are mocked.
const https = require('https');
const db = require('../../src/config/database');
const fmp = require('../../src/utils/finnhub');
const yahoo = require('../../src/utils/yahooFinance');
const ChartService = require('../../src/services/chartService');

describe('issue 384: configured Databento with Yahoo disabled', () => {
  let requests;
  let response_status;
  let response_body;
  let yahoo_spy;

  const chart = (symbol) => {
    const trade = {
      symbol,
      instrument_type: 'future',
      entry_time: '2026-08-10T14:00:00Z',
      exit_time: '2026-08-10T14:02:00Z'
    };
    return ChartService.getTradeChartData(
      'test-user', symbol, trade.entry_time, trade.exit_time, null, '1', trade
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.YAHOO_FINANCE_ENABLED = 'false';
    db.query.mockResolvedValue({ rows: [] });
    fmp.isConfigured.mockReturnValue(false);
    yahoo_spy = jest.spyOn(yahoo, 'getFuturesTradeChartData');
    requests = [];
    response_status = 200;
    response_body = JSON.stringify({
      hd: { ts_event: '1786370400000000000' },
      open: '6400000000000', high: '6401250000000',
      low: '6399500000000', close: '6400750000000', volume: 42
    }) + '\n';
    https.request.mockImplementation((options, callback) => {
      const response = new EventEmitter();
      response.statusCode = response_status;
      const request = new EventEmitter();
      const captured = { options, body: '' };
      requests.push(captured);
      request.write = (chunk) => { captured.body += chunk; };
      request.end = () => {
        callback(response);
        // Exercise the streaming response parser across chunk boundaries.
        response.emit('data', response_body.slice(0, 25));
        response.emit('data', response_body.slice(25));
        response.emit('end');
      };
      return request;
    });
  });

  afterEach(() => yahoo_spy.mockRestore());
  afterAll(() => {
    if (original_key === undefined) delete process.env.DATABENTO_API_KEY;
    else process.env.DATABENTO_API_KEY = original_key;
    if (original_yahoo === undefined) delete process.env.YAHOO_FINANCE_ENABLED;
    else process.env.YAHOO_FINANCE_ENABLED = original_yahoo;
  });

  test.each([['ESU6', 'ES'], ['MESU6', 'MES']])(
    '%s produces correctly scaled Databento candles with Yahoo disabled',
    async (symbol, root) => {
      const result = await chart(symbol);
      expect(result).toMatchObject({
        source: 'databento', chart_symbol: `${root}.c.0`,
        candles: [{ time: 1786370400, open: 6400, high: 6401.25,
          low: 6399.5, close: 6400.75, volume: 42 }]
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].options).toMatchObject({
        method: 'POST', hostname: 'hist.databento.com', path: '/v0/timeseries.get_range',
        headers: {
          Authorization: `Basic ${Buffer.from('db-test-key:').toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      expect(Object.fromEntries(new URLSearchParams(requests[0].body))).toMatchObject({
        dataset: 'GLBX.MDP3', symbols: `${root}.c.0`, schema: 'ohlcv-1m',
        stype_in: 'continuous', encoding: 'json',
        start: '2026-08-09T22:00:00.000Z', end: '2026-08-10T21:00:00.000Z'
      });
      expect(yahoo_spy).not.toHaveBeenCalled();
    }
  );

  test('Databento takes priority even with FMP and Yahoo enabled', async () => {
    process.env.YAHOO_FINANCE_ENABLED = 'true';
    fmp.isConfigured.mockReturnValue(true);
    fmp.getFuturesTradeChartData.mockResolvedValue({ source: 'fmp', candles: [] });
    expect((await chart('MESU6')).source).toBe('databento');
    expect(fmp.getFuturesTradeChartData).not.toHaveBeenCalled();
    expect(yahoo_spy).not.toHaveBeenCalled();
  });

  test.each([
    [401, 'authentication failed'],
    [402, 'Insufficient credits'],
    [422, 'Databento API error (422)']
  ])('HTTP %s reports the Databento failure and never calls disabled Yahoo', async (status, message) => {
    response_status = status;
    response_body = '{"detail":"provider failure"}';
    await expect(chart('MESU6')).rejects.toThrow(message);
    expect(yahoo_spy).not.toHaveBeenCalled();
  });
});
