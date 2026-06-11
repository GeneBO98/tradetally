describe('market data provider selection', () => {
  let originalEnv;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    jest.doMock('../../src/utils/finnhubClient', () => ({
      providerName: 'finnhub',
      displayName: 'Finnhub',
      isConfigured: jest.fn(() => true)
    }));
    jest.doMock('../../src/utils/fmpClient', () => ({
      providerName: 'fmp',
      displayName: 'Financial Modeling Prep',
      isConfigured: jest.fn(() => true)
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.dontMock('../../src/utils/finnhubClient');
    jest.dontMock('../../src/utils/fmpClient');
  });

  test('defaults to Finnhub', () => {
    delete process.env.MARKET_DATA_PROVIDER;
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.BILLING_ENABLED = 'false';

    const provider = require('../../src/utils/finnhub');

    expect(provider.providerName).toBe('finnhub');
  });

  test('uses FMP for explicit self-hosted env selection', () => {
    process.env.MARKET_DATA_PROVIDER = 'fmp';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.BILLING_ENABLED = 'false';

    const provider = require('../../src/utils/finnhub');

    expect(provider.providerName).toBe('fmp');
  });

  test('uses FMP when selected even for cloud deployments', () => {
    process.env.MARKET_DATA_PROVIDER = 'fmp';
    process.env.FRONTEND_URL = 'https://tradetally.io';
    process.env.BILLING_ENABLED = 'true';

    const provider = require('../../src/utils/finnhub');

    expect(provider.providerName).toBe('fmp');
  });
});
