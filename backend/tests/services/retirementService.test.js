jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/portfolioService', () => ({
  getOverview: jest.fn(),
  getHistoricalReturnScenarios: jest.fn(),
  getRetirementAccountBreakdown: jest.fn()
}));
jest.mock('../../src/services/historicalInflationService', () => ({
  enrichScenarios: jest.fn()
}));

const db = require('../../src/config/database');
const PortfolioService = require('../../src/services/portfolioService');
const HistoricalInflationService = require('../../src/services/historicalInflationService');
const RetirementService = require('../../src/services/retirementService');

const validPlan = {
  current_age: 40,
  age_as_of_date: '2026-01-01',
  target_retirement_age: 65,
  current_annual_cost_of_living: 60000,
  desired_annual_retirement_spending: 60000,
  target_portfolio_balance: null,
  monthly_contribution: 1000,
  annual_contribution_increase_percent: 0,
  additional_retirement_savings: 10000,
  other_annual_retirement_income: 20000,
  other_income_start_age: 67,
  custom_return_rate_percent: 7,
  inflation_rate_percent: 3,
  withdrawal_rate_percent: 4
};

describe('RetirementService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    HistoricalInflationService.enrichScenarios.mockImplementation(async scenarios => ({
      scenarios,
      source: 'historical_us_cpi_u',
      series_id: 'CUUR0000SA0',
      unavailable: false,
      message: null
    }));
    PortfolioService.getRetirementAccountBreakdown.mockResolvedValue([{
      account_identifier: 'ira-1',
      account_name: 'Retirement IRA',
      broker: 'Fidelity',
      sources: ['manual_holdings'],
      source_record_count: 2
    }]);
  });

  test('calculates against all accounts when no account scope is supplied', async () => {
    PortfolioService.getOverview.mockResolvedValue({
      totalValue: 250000,
      totalCostBasis: 200000,
      positionCount: 4,
      priceStalePositionCount: 1
    });
    PortfolioService.getHistoricalReturnScenarios.mockResolvedValue([]);

    const result = await RetirementService.calculate('user-1', validPlan);

    expect(PortfolioService.getOverview).toHaveBeenCalledWith('user-1', {});
    expect(result.portfolio.scope).toBe('all_accounts');
    expect(result.portfolio.price_stale_position_count).toBe(1);
    expect(result.portfolio.available_accounts[0].sources).toEqual(['manual_holdings']);
    expect(result.projection.baseline.starting_balance).toBe(260000);
  });

  test('pairs portfolio return periods with their historical inflation periods', async () => {
    PortfolioService.getOverview.mockResolvedValue({
      totalValue: 250000,
      totalCostBasis: 200000,
      positionCount: 4
    });
    PortfolioService.getHistoricalReturnScenarios.mockResolvedValue([{
      key: 'historical_5y',
      source: 'historical',
      period_years: 5,
      annual_return_percent: 8,
      data_start: '2021-01-01',
      data_end: '2026-01-01'
    }]);
    HistoricalInflationService.enrichScenarios.mockResolvedValue({
      scenarios: [{
        key: 'historical_5y',
        source: 'historical',
        period_years: 5,
        annual_return_percent: 8,
        inflation_rate_percent: 3.2,
        inflation_source: 'historical_us_cpi_u'
      }],
      source: 'historical_us_cpi_u',
      series_id: 'CUUR0000SA0',
      unavailable: false,
      message: null
    });

    const result = await RetirementService.calculate('user-1', validPlan);

    expect(HistoricalInflationService.enrichScenarios).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ period_years: 5 })])
    );
    expect(result.projection.scenarios[1].inflation_rate_percent).toBe(3.2);
    expect(result.projection.scenarios[1].inflation_source).toBe('historical_us_cpi_u');
  });

  test('passes account filters to portfolio aggregation for scoped previews', async () => {
    PortfolioService.getOverview.mockResolvedValue({
      totalValue: 100000,
      totalCostBasis: 90000,
      positionCount: 2
    });
    PortfolioService.getHistoricalReturnScenarios.mockResolvedValue([]);

    const result = await RetirementService.calculate('user-1', validPlan, {
      accounts: 'retirement-1,retirement-2'
    });

    expect(PortfolioService.getOverview).toHaveBeenCalledWith('user-1', {
      accounts: 'retirement-1,retirement-2'
    });
    expect(result.portfolio.accounts).toEqual(['retirement-1', 'retirement-2']);
  });

  test('upserts one saved plan per user', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          ...validPlan,
          user_id: 'user-1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z'
        }]
      });

    const saved = await RetirementService.savePlan('user-1', validPlan);

    expect(db.query.mock.calls[1][0]).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(db.query.mock.calls[1][1][0]).toBe('user-1');
    expect(saved.current_age).toBe(40);
  });

  test('deletes only the current user plan', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });

    await expect(RetirementService.deletePlan('user-2')).resolves.toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      'DELETE FROM retirement_plans WHERE user_id = $1',
      ['user-2']
    );
  });
});
