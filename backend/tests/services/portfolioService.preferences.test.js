jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/alphaVantage', () => ({}));
jest.mock('../../src/utils/historicalPriceCache', () => ({}));
jest.mock('../../src/services/holdingsService', () => ({}));
jest.mock('../../src/services/notificationService', () => ({}));

const db = require('../../src/config/database');
const PortfolioService = require('../../src/services/portfolioService');

describe('portfolio preferences', () => {
  beforeEach(() => jest.clearAllMocks());

  test('preserves zero thresholds and disabled alerts on reload', async () => {
    db.query.mockResolvedValue({ rows: [{
      default_benchmark_symbol: 'QQQ', drift_threshold_percent: '0.00',
      drawdown_threshold_percent: '0.00', alerts_enabled: false
    }] });
    expect(await PortfolioService.getPreferences('user')).toEqual({
      defaultBenchmarkSymbol: 'QQQ', driftThresholdPercent: 0,
      drawdownThresholdPercent: 0, alertsEnabled: false
    });
  });

  test('retains defaults for missing or invalid thresholds', async () => {
    db.query.mockResolvedValue({ rows: [{
      drift_threshold_percent: null, drawdown_threshold_percent: 'invalid'
    }] });
    expect(await PortfolioService.getPreferences('user')).toEqual({
      defaultBenchmarkSymbol: 'SPY', driftThresholdPercent: 5,
      drawdownThresholdPercent: 10, alertsEnabled: true
    });
  });
});
