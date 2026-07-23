jest.mock('../../src/services/tierService', () => ({
  getUserTier: jest.fn(),
  isBillingEnabled: jest.fn()
}));
jest.mock('../../src/utils/finnhub', () => ({
  isCryptoSymbol: jest.fn(() => false),
  isConfigured: jest.fn(),
  displayName: 'Financial Modeling Prep',
  providerName: 'fmp',
  getFuturesTradeChartData: jest.fn(),
  getTradeChartData: jest.fn()
}));
jest.mock('../../src/utils/alphaVantage', () => ({
  isConfigured: jest.fn(() => false)
}));
jest.mock('../../src/utils/databento', () => ({
  isConfigured: jest.fn()
}));
jest.mock('../../src/utils/yahooFinance', () => ({
  isEnabled: jest.fn(),
  getFuturesTradeChartData: jest.fn()
}));
jest.mock('../../src/services/replayDataService', () => ({
  futuresRootForTrade: jest.fn(() => 'MNQ'),
  getFuturesTradeChartData: jest.fn()
}));
jest.mock('axios', () => ({}));

const TierService = require('../../src/services/tierService');
const finnhub = require('../../src/utils/finnhub');
const databento = require('../../src/utils/databento');
const yahooFinance = require('../../src/utils/yahooFinance');
const replayDataService = require('../../src/services/replayDataService');
const ChartService = require('../../src/services/chartService');

describe('ChartService futures routing', () => {
  const trade = {
    symbol: 'MNQM6',
    instrument_type: 'future',
    entry_time: '2026-06-15T14:00:00Z',
    exit_time: '2026-06-15T15:00:00Z'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    TierService.getUserTier.mockResolvedValue('free');
    TierService.isBillingEnabled.mockResolvedValue(false);
    finnhub.isConfigured.mockReturnValue(true);
    databento.isConfigured.mockReturnValue(true);
    yahooFinance.isEnabled.mockReturnValue(true);
    finnhub.getFuturesTradeChartData.mockResolvedValue({
      source: 'fmp',
      candles: [{ time: 1, open: 1, high: 2, low: 1, close: 2 }]
    });
    replayDataService.getFuturesTradeChartData.mockResolvedValue({
      source: 'databento',
      candles: [{ time: 1, open: 1, high: 2, low: 1, close: 2 }]
    });
    yahooFinance.getFuturesTradeChartData.mockResolvedValue({
      source: 'yahoo',
      candles: [{ time: 1, open: 1, high: 2, low: 1, close: 2 }]
    });
  });

  it('prefers the configured provider over Databento and the no-cost fallback', async () => {
    const result = await ChartService.getTradeChartData(
      'user-1', trade.symbol, trade.entry_time, trade.exit_time, null, '15', trade
    );

    expect(finnhub.getFuturesTradeChartData).toHaveBeenCalledWith('MNQ', trade, 'user-1', '15');
    expect(replayDataService.getFuturesTradeChartData).not.toHaveBeenCalled();
    expect(yahooFinance.getFuturesTradeChartData).not.toHaveBeenCalled();
    expect(finnhub.getTradeChartData).not.toHaveBeenCalled();
    expect(result.source).toBe('fmp');
  });

  it('uses Databento when the configured provider cannot serve the future', async () => {
    finnhub.getFuturesTradeChartData.mockRejectedValue(new Error('plan does not include commodities'));

    const result = await ChartService.getTradeChartData(
      'user-1', trade.symbol, trade.entry_time, trade.exit_time, null, '5', trade
    );

    expect(replayDataService.getFuturesTradeChartData).toHaveBeenCalledWith(trade, '5');
    expect(yahooFinance.getFuturesTradeChartData).not.toHaveBeenCalled();
    expect(result.source).toBe('databento');
  });

  it('uses Yahoo only when no configured provider can serve the future', async () => {
    finnhub.isConfigured.mockReturnValue(false);
    databento.isConfigured.mockReturnValue(false);

    const result = await ChartService.getTradeChartData(
      'user-1', trade.symbol, trade.entry_time, trade.exit_time, null, '1', trade
    );

    expect(yahooFinance.getFuturesTradeChartData).toHaveBeenCalledWith('MNQ', trade, '1');
    expect(result.source).toBe('yahoo');
  });

  it('preserves the hosted Pro entitlement before requesting futures data', async () => {
    TierService.isBillingEnabled.mockResolvedValue(true);

    await expect(ChartService.getTradeChartData(
      'user-1', trade.symbol, trade.entry_time, trade.exit_time, 'tradetally.io', '1', trade
    )).rejects.toMatchObject({ statusCode: 403 });

    expect(replayDataService.getFuturesTradeChartData).not.toHaveBeenCalled();
  });
});
