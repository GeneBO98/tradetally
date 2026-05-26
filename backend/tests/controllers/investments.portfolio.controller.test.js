jest.mock('../../src/services/eightPillarsService', () => ({}));
jest.mock('../../src/services/fundamentalDataService', () => ({
  isCryptoSymbol: jest.fn()
}));
jest.mock('../../src/services/dcfValuationService', () => ({}));
jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/holdingsService', () => ({
  refreshPrices: jest.fn()
}));
jest.mock('../../src/services/portfolioService', () => ({
  getOverview: jest.fn(),
  getPositions: jest.fn(),
  getPerformance: jest.fn(),
  getRebalancePlan: jest.fn(),
  getPreferences: jest.fn(),
  updatePreferences: jest.fn(),
  evaluateAlerts: jest.fn()
}));

const investmentsController = require('../../src/controllers/investments.controller');
const HoldingsService = require('../../src/services/holdingsService');
const PortfolioService = require('../../src/services/portfolioService');

function createMockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('investments portfolio controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getPortfolioOverview returns overview and evaluates alerts', async () => {
    const req = {
      user: { id: 'user-1' },
      query: { accounts: 'acct-1', benchmark: 'qqq', period: '1Y' }
    };
    const res = createMockRes();

    PortfolioService.getOverview.mockResolvedValue({ totalValue: 1234, positionCount: 2 });
    PortfolioService.evaluateAlerts.mockResolvedValue([]);

    await investmentsController.getPortfolioOverview(req, res);

    expect(PortfolioService.getOverview).toHaveBeenCalledWith('user-1', {
      accounts: 'acct-1',
      benchmark: 'qqq',
      period: '1Y'
    });
    expect(PortfolioService.evaluateAlerts).toHaveBeenCalledWith('user-1', {
      accounts: 'acct-1',
      benchmark: 'qqq',
      period: '1Y'
    });
    expect(res.json).toHaveBeenCalledWith({ totalValue: 1234, positionCount: 2 });
  });

  test('getPortfolioSummary reshapes overview for legacy consumers', async () => {
    const req = {
      user: { id: 'user-2' },
      query: {}
    };
    const res = createMockRes();

    PortfolioService.getOverview.mockResolvedValue({
      positionCount: 3,
      totalValue: 5000,
      totalCostBasis: 4500,
      unrealizedPnL: 500,
      unrealizedPnLPercent: 11.11,
      totalDividends: 120,
      totalReturn: 620,
      allocation: [{ symbol: 'AAPL', value: 5000, percent: 100 }]
    });

    await investmentsController.getPortfolioSummary(req, res);

    expect(res.json).toHaveBeenCalledWith({
      holdingCount: 3,
      totalValue: 5000,
      totalCostBasis: 4500,
      unrealizedPnL: 500,
      unrealizedPnLPercent: 11.11,
      totalDividends: 120,
      totalReturn: 620,
      allocation: [{ symbol: 'AAPL', value: 5000, percent: 100 }]
    });
  });

  test('refreshPrices returns count and triggers alert evaluation', async () => {
    const req = {
      user: { id: 'user-3' }
    };
    const res = createMockRes();

    HoldingsService.refreshPrices.mockResolvedValue([{ symbol: 'AAPL' }, { symbol: 'MSFT' }]);
    PortfolioService.evaluateAlerts.mockResolvedValue([]);

    await investmentsController.refreshPrices(req, res);

    expect(HoldingsService.refreshPrices).toHaveBeenCalledWith('user-3');
    expect(PortfolioService.evaluateAlerts).toHaveBeenCalledWith('user-3');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Refreshed 2 holdings',
      updated: 2
    });
  });
});
