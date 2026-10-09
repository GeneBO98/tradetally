jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({
  getCompanyProfile: jest.fn(),
  displayName: 'Finnhub'
}));
jest.mock('../../src/utils/yahooFinance', () => ({
  isEnabled: jest.fn(() => true),
  getSymbolProfile: jest.fn()
}));
jest.mock('../../src/services/tierService', () => ({ isBillingEnabled: jest.fn() }));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn(() => null), set: jest.fn(), del: jest.fn(), data: {} }));

const db = require('../../src/config/database');
const finnhub = require('../../src/utils/finnhub');
const yahooFinance = require('../../src/utils/yahooFinance');
const TierService = require('../../src/services/tierService');
const symbolCategories = require('../../src/utils/symbolCategories');

function storedRows(rows) {
  db.query.mockImplementation(async (sql) => (
    sql.includes('SELECT') ? { rows } : { rows: [] }
  ));
}

function planRestriction() {
  return Object.assign(new Error('You do not have access to this resource'), { status: 403 });
}

describe('symbol category provider fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storedRows([]);
    yahooFinance.isEnabled.mockReturnValue(true);
    TierService.isBillingEnabled.mockResolvedValue(false);
    yahooFinance.getSymbolProfile.mockResolvedValue(null);
  });

  test('a plan restriction no longer abandons the symbol', async () => {
    finnhub.getCompanyProfile.mockRejectedValue(planRestriction());
    yahooFinance.getSymbolProfile.mockResolvedValue({
      symbol: 'EXCO.DE',
      name: 'Example Company AG',
      industry: 'Auto Manufacturers',
      exchange: 'XETRA'
    });

    const category = await symbolCategories.getSymbolCategory('EXCO.DE');

    expect(category.company_name).toBe('Example Company AG');
    expect(category.finnhub_industry).toBe('Auto Manufacturers');
    expect(category.exchange).toBe('XETRA');
  });

  test('does not call Yahoo when billing is enabled', async () => {
    TierService.isBillingEnabled.mockResolvedValue(true);
    finnhub.getCompanyProfile.mockRejectedValue(planRestriction());

    const category = await symbolCategories.getSymbolCategory('EXCO.DE');

    expect(yahooFinance.getSymbolProfile).not.toHaveBeenCalled();
    expect(category).toBeNull();
  });

  test('does not call Yahoo when the configured provider already answered', async () => {
    finnhub.getCompanyProfile.mockResolvedValue({
      name: 'Apple Inc', finnhubIndustry: 'Technology', exchange: 'NASDAQ'
    });

    const category = await symbolCategories.getSymbolCategory('AAPL');

    expect(yahooFinance.getSymbolProfile).not.toHaveBeenCalled();
    expect(category.company_name).toBe('Apple Inc');
  });

  test('skips the fallback rather than failing when the billing check throws', async () => {
    TierService.isBillingEnabled.mockRejectedValue(new Error('instance_config unavailable'));
    finnhub.getCompanyProfile.mockResolvedValue({ name: 'Apple Inc' });

    const category = await symbolCategories.getSymbolCategory('AAPL');

    expect(yahooFinance.getSymbolProfile).not.toHaveBeenCalled();
    expect(category.company_name).toBe('Apple Inc');
  });

  test('does not spend a Yahoo request on an option contract symbol', async () => {
    finnhub.getCompanyProfile.mockRejectedValue(planRestriction());

    await symbolCategories.getSymbolCategory('SPY   260618P00350000');

    expect(yahooFinance.getSymbolProfile).not.toHaveBeenCalled();
  });

  test('returns null rather than throwing when both providers fail', async () => {
    finnhub.getCompanyProfile.mockRejectedValue(planRestriction());
    yahooFinance.getSymbolProfile.mockRejectedValue(new Error('network down'));

    await expect(symbolCategories.getSymbolCategory('EXCO.DE')).resolves.toBeNull();
  });

  test('returns null when neither provider knows the symbol', async () => {
    finnhub.getCompanyProfile.mockResolvedValue(null);
    yahooFinance.getSymbolProfile.mockResolvedValue(null);

    await expect(symbolCategories.getSymbolCategory('NOSUCH.ZZ')).resolves.toBeNull();
  });

  test('keeps stored metadata when both providers fail', async () => {
    storedRows([{ symbol: 'EXCO.DE', company_name: 'Example Company AG', finnhub_industry: null, updated_at: null }]);
    finnhub.getCompanyProfile.mockRejectedValue(planRestriction());
    yahooFinance.getSymbolProfile.mockRejectedValue(new Error('network down'));

    const category = await symbolCategories.getSymbolCategory('EXCO.DE');

    expect(category.company_name).toBe('Example Company AG');
  });

  test('does not spend a second request once the configured provider named the symbol', async () => {
    finnhub.getCompanyProfile.mockResolvedValue({ name: 'Example Company AG' });

    const category = await symbolCategories.getSymbolCategory('EXCO.DE');

    expect(yahooFinance.getSymbolProfile).not.toHaveBeenCalled();
    expect(category.company_name).toBe('Example Company AG');
  });

  test('fills the gaps when the configured provider returned an empty profile', async () => {
    finnhub.getCompanyProfile.mockResolvedValue({ country: 'DE', currency: 'EUR' });
    yahooFinance.getSymbolProfile.mockResolvedValue({
      name: 'Example Company AG', industry: 'Auto Manufacturers', exchange: 'XETRA'
    });

    const category = await symbolCategories.getSymbolCategory('EXCO.DE');

    expect(category.company_name).toBe('Example Company AG');
    expect(category.finnhub_industry).toBe('Auto Manufacturers');
    expect(category.country).toBe('DE');
  });

  test('an ETF with no industry is still worth a name', async () => {
    finnhub.getCompanyProfile.mockRejectedValue(planRestriction());
    yahooFinance.getSymbolProfile.mockResolvedValue({
      name: 'EXAMPLE PHYSICAL GOLD', industry: null, exchange: 'LSE'
    });

    const category = await symbolCategories.getSymbolCategory('EXETF.L');

    expect(category.company_name).toBe('EXAMPLE PHYSICAL GOLD');
    expect(category.finnhub_industry).toBeNull();
  });

  test('a lookup that resolves nothing is still saved so it is not re-fetched', async () => {
    finnhub.getCompanyProfile.mockResolvedValue({ name: null });
    yahooFinance.getSymbolProfile.mockResolvedValue(null);

    await symbolCategories.getSymbolCategory('NOSUCH.ZZ');

    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO symbol_categories'))).toBe(true);
  });
});
