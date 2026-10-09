jest.mock('../../src/utils/cache', () => ({
  get: jest.fn(async () => null),
  set: jest.fn(async () => true)
}));
jest.mock('../../src/services/apiUsageService', () => ({
  checkLimit: jest.fn(async () => ({ allowed: true })),
  trackApiCall: jest.fn(async () => true)
}));
jest.mock('../../src/services/tierService', () => ({ getUserTier: jest.fn(async () => 'pro') }));

const finnhub = require('../../src/utils/finnhubClient');

afterEach(() => jest.restoreAllMocks());

test('requests forex candles from the forex endpoint using Finnhub notation', async () => {
  const response = { s: 'ok', t: [1], o: [1.1], h: [1.2], l: [1], c: [1.15], v: [20] };
  const request = jest.spyOn(finnhub, 'makeRequest').mockResolvedValue(response);
  const candles = await finnhub.getForexCandles('BLACKBULL:EURUSD', '5', 100, 200, 'user-1');

  expect(request).toHaveBeenCalledWith('/forex/candle', {
    symbol: 'OANDA:EUR_USD', resolution: '5', from: 100, to: 200
  }, expect.objectContaining({ source: 'forex_candles', userId: 'user-1' }));
  expect(candles).toEqual([{ time: 1, open: 1.1, high: 1.2, low: 1, close: 1.15, volume: 20 }]);
});

test('trade charts use forex candles and expose the provider symbol', async () => {
  const candles = [{ time: 1, open: 1.1, high: 1.2, low: 1, close: 1.15, volume: 20 }];
  const forex = jest.spyOn(finnhub, 'getForexCandles').mockResolvedValue(candles);
  const stock = jest.spyOn(finnhub, 'getStockCandles').mockResolvedValue([]);

  const result = await finnhub.getForexTradeChartData(
    'BLACKBULL:EURUSD', '2026-09-01T14:00:00Z', '2026-09-01T15:00:00Z', 'user-1', '5'
  );

  expect(forex).toHaveBeenCalledWith('BLACKBULL:EURUSD', '5', expect.any(Number), expect.any(Number), 'user-1');
  expect(stock).not.toHaveBeenCalled();
  expect(result).toMatchObject({ source: 'finnhub', chart_symbol: 'OANDA:EUR_USD', candles });
});
