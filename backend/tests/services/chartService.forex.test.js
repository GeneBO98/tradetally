jest.mock('../../src/services/tierService', () => ({
  getUserTier: jest.fn(),
  isBillingEnabled: jest.fn()
}));
jest.mock('../../src/utils/finnhub', () => ({
  isCryptoSymbol: jest.fn(() => false),
  isConfigured: jest.fn(() => true),
  displayName: 'Finnhub',
  providerName: 'finnhub',
  getForexTradeChartData: jest.fn(),
  getTradeChartData: jest.fn()
}));
jest.mock('../../src/utils/alphaVantage', () => ({ isConfigured: jest.fn(() => false) }));
jest.mock('../../src/utils/databento', () => ({ isConfigured: jest.fn(() => false) }));
jest.mock('../../src/utils/yahooFinance', () => ({
  isEnabled: jest.fn(() => true),
  getForexTradeChartData: jest.fn()
}));
jest.mock('../../src/services/replayDataService', () => ({}));
jest.mock('axios', () => ({}));

const TierService = require('../../src/services/tierService');
const finnhub = require('../../src/utils/finnhub');
const yahooFinance = require('../../src/utils/yahooFinance');
const ChartService = require('../../src/services/chartService');

const trade = {
  symbol: 'BLACKBULL:EURUSD',
  instrument_type: 'forex',
  entry_time: '2026-09-01T14:00:00Z',
  exit_time: '2026-09-01T15:00:00Z'
};

beforeEach(() => {
  jest.clearAllMocks();
  TierService.getUserTier.mockResolvedValue('pro');
  TierService.isBillingEnabled.mockResolvedValue(true);
  finnhub.getForexTradeChartData.mockResolvedValue({ source: 'finnhub', chart_symbol: 'OANDA:EUR_USD', candles: [] });
});

test('routes forex trades through the provider forex method', async () => {
  const result = await ChartService.getTradeChartData(
    'user-1', trade.symbol, trade.entry_time, trade.exit_time, 'tradetally.io', '5', trade
  );
  expect(finnhub.getForexTradeChartData).toHaveBeenCalledWith(
    trade.symbol, trade.entry_time, trade.exit_time, 'user-1', '5'
  );
  expect(finnhub.getTradeChartData).not.toHaveBeenCalled();
  expect(result.chart_symbol).toBe('OANDA:EUR_USD');
});

test('self-hosted mode falls back to Yahoo forex notation', async () => {
  TierService.isBillingEnabled.mockResolvedValue(false);
  finnhub.getForexTradeChartData.mockRejectedValue(new Error('forex entitlement unavailable'));
  yahooFinance.getForexTradeChartData.mockResolvedValue({ source: 'yahoo', chart_symbol: 'EURUSD=X', candles: [] });

  const result = await ChartService.getTradeChartData(
    'user-1', trade.symbol, trade.entry_time, trade.exit_time, null, '15', trade
  );
  expect(yahooFinance.getForexTradeChartData).toHaveBeenCalledWith(
    trade.symbol, trade.entry_time, trade.exit_time, '15'
  );
  expect(result).toMatchObject({ source: 'yahoo', chart_symbol: 'EURUSD=X', fallback: true });
});
