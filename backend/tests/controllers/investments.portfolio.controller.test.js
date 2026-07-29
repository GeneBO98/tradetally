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
  setTarget: jest.fn(),
  evaluateAlerts: jest.fn()
}));
jest.mock('../../src/services/retirementService', () => ({
  get: jest.fn(),
  calculate: jest.fn(),
  savePlan: jest.fn(),
  deletePlan: jest.fn()
}));

const investmentsController = require('../../src/controllers/investments.controller');
const HoldingsService = require('../../src/services/holdingsService');
const PortfolioService = require('../../src/services/portfolioService');
const RetirementService = require('../../src/services/retirementService');

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

  test('setPortfolioTarget upserts a target by symbol for any position', async () => {
    const req = { user: { id: 'user-9' }, body: { symbol: 'IAG', targetAllocationPercent: 25 } };
    const res = createMockRes();

    PortfolioService.setTarget.mockResolvedValue({ symbol: 'IAG', targetAllocationPercent: 25 });

    await investmentsController.setPortfolioTarget(req, res);

    expect(PortfolioService.setTarget).toHaveBeenCalledWith('user-9', 'IAG', 25);
    expect(res.json).toHaveBeenCalledWith({ symbol: 'IAG', targetAllocationPercent: 25 });
  });

  test('setPortfolioTarget rejects a missing symbol with 400', async () => {
    const req = { user: { id: 'user-9' }, body: { targetAllocationPercent: 25 } };
    const res = createMockRes();

    await investmentsController.setPortfolioTarget(req, res);

    expect(PortfolioService.setTarget).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('setPortfolioTarget maps validation errors to 400', async () => {
    const req = { user: { id: 'user-9' }, body: { symbol: 'IAG', targetAllocationPercent: 250 } };
    const res = createMockRes();

    PortfolioService.setTarget.mockRejectedValue(new Error('Target allocation must be between 0 and 100'));

    await investmentsController.setPortfolioTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
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

  test('getRetirementPlan returns an account-filtered preview', async () => {
    const req = { user: { id: 'user-4' }, query: { accounts: 'ira-1' } };
    const res = createMockRes();
    RetirementService.get.mockResolvedValue({ has_saved_plan: true });

    await investmentsController.getRetirementPlan(req, res);

    expect(RetirementService.get).toHaveBeenCalledWith('user-4', { accounts: 'ira-1' });
    expect(res.json).toHaveBeenCalledWith({ has_saved_plan: true });
  });

  test('saveRetirementPlan persists inputs and returns the all-account projection', async () => {
    const req = {
      user: { id: 'user-5' },
      query: { accounts: 'ignored-on-save' },
      body: { current_age: 40 }
    };
    const res = createMockRes();
    RetirementService.savePlan.mockResolvedValue({ current_age: 40 });
    RetirementService.calculate.mockResolvedValue({ projection: { scenarios: [] } });

    await investmentsController.saveRetirementPlan(req, res);

    expect(RetirementService.savePlan).toHaveBeenCalledWith('user-5', req.body);
    expect(RetirementService.calculate).toHaveBeenCalledWith(
      'user-5',
      { current_age: 40 }
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      has_saved_plan: true
    }));
  });

  test('deleteRetirementPlan resets only the current user plan', async () => {
    const req = { user: { id: 'user-6' } };
    const res = createMockRes();
    RetirementService.deletePlan.mockResolvedValue(true);

    await investmentsController.deleteRetirementPlan(req, res);

    expect(RetirementService.deletePlan).toHaveBeenCalledWith('user-6');
    expect(res.json).toHaveBeenCalledWith({ deleted: true });
  });
});
