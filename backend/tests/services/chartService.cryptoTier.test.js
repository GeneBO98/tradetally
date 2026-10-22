jest.mock('../../src/services/tierService', () => ({
  getUserTier: jest.fn(),
  isBillingEnabled: jest.fn()
}));
jest.mock('../../src/utils/finnhub', () => ({
  isCryptoSymbol: jest.fn(() => true),
  isConfigured: jest.fn(() => true),
  getTradeChartData: jest.fn()
}));
jest.mock('../../src/utils/alphaVantage', () => ({ isConfigured: jest.fn(() => false) }));
jest.mock('../../src/utils/databento', () => ({ isConfigured: jest.fn(() => false) }));
jest.mock('../../src/utils/yahooFinance', () => ({ isEnabled: jest.fn(() => false) }));
jest.mock('../../src/services/replayDataService', () => ({}));
jest.mock('axios', () => ({}));

const TierService = require('../../src/services/tierService');
const ChartService = require('../../src/services/chartService');

describe('ChartService crypto tier gate', () => {
  let cryptoSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    cryptoSpy = jest.spyOn(ChartService, 'getCryptoTradeChartData')
      .mockResolvedValue({ source: 'coingecko', candles: [] });
  });

  afterEach(() => cryptoSpy.mockRestore());

  test('rejects crypto charts for free users when billing is enabled', async () => {
    TierService.isBillingEnabled.mockResolvedValue(true);
    TierService.getUserTier.mockResolvedValue('free');

    await expect(
      ChartService.getTradeChartData('user-1', 'BTCUSD', '2026-09-01', '2026-09-02', 'tradetally.io')
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(cryptoSpy).not.toHaveBeenCalled();
  });

  test('serves crypto charts for Pro users', async () => {
    TierService.isBillingEnabled.mockResolvedValue(true);
    TierService.getUserTier.mockResolvedValue('pro');

    const result = await ChartService.getTradeChartData('user-1', 'BTCUSD', '2026-09-01', '2026-09-02', 'tradetally.io');
    expect(result.source).toBe('coingecko');
  });

  test('serves crypto charts on self-hosted installs (billing disabled)', async () => {
    TierService.isBillingEnabled.mockResolvedValue(false);
    TierService.getUserTier.mockResolvedValue('pro');

    const result = await ChartService.getTradeChartData('user-1', 'BTCUSD', '2026-09-01', '2026-09-02', null);
    expect(result.source).toBe('coingecko');
  });
});
