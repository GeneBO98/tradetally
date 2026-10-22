// Advanced trade filters are Pro-only (advanced_filtering). They are dropped
// centrally in TradeQueries._buildWhereClause so the trade list, counts,
// exports, and every analytics query agree for free users.

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn().mockResolvedValue('America/New_York'),
  getUserLocalDate: jest.fn()
}));
jest.mock('../../src/services/achievementService', () => ({}));
jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn().mockResolvedValue({ statistics_calculation: 'average' })
}));
jest.mock('../../src/services/tierService', () => ({
  isProUser: jest.fn()
}));

const TierService = require('../../src/services/tierService');
const TradeQueries = require('../../src/services/tradeQueries');
const {
  hasAdvancedFilters,
  stripAdvancedFilters,
  restrictFiltersToTier
} = require('../../src/utils/tradeFilters');

const ADVANCED = {
  daysOfWeek: [1, 2],
  holdTime: '1-5 min',
  qualityGrades: ['A'],
  hasNews: 'true',
  minPnl: 10,
  maxPnl: 500,
  minPrice: 5,
  maxQuantity: 1000,
  sectors: ['Technology'],
  market_sessions: ['regular'],
  optionTypes: ['call']
};

const BASIC = {
  pnlType: 'profit',
  symbol: 'AAPL',
  side: 'long',
  status: 'closed',
  startDate: '2026-01-01',
  endDate: '2026-02-01',
  accounts: ['ACC1'],
  brokers: 'schwab',
  strategies: ['breakout'],
  tags: ['a+']
};

describe('advanced filter tier restriction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('detects only active advanced values', () => {
    expect(hasAdvancedFilters(BASIC)).toBe(false);
    expect(hasAdvancedFilters({ ...BASIC, daysOfWeek: [], minPnl: undefined, pnlType: '' })).toBe(false);
    expect(hasAdvancedFilters({ ...BASIC, minPnl: 0 })).toBe(true);
  });

  test('strip keeps every basic filter', () => {
    expect(stripAdvancedFilters({ ...BASIC, ...ADVANCED })).toEqual(BASIC);
  });

  test('free users lose advanced filters; basic ones are untouched', async () => {
    TierService.isProUser.mockResolvedValue(false);
    const result = await restrictFiltersToTier('user-1', { ...BASIC, ...ADVANCED });
    expect(result).toEqual(BASIC);
    expect(TierService.isProUser).toHaveBeenCalledWith('user-1');
  });

  test('Pro users (and self-hosted, which resolve to Pro) keep advanced filters', async () => {
    TierService.isProUser.mockResolvedValue(true);
    const filters = { ...BASIC, ...ADVANCED };
    expect(await restrictFiltersToTier('user-1', filters)).toBe(filters);
  });

  test('skips the tier lookup when no advanced filter is set', async () => {
    const filters = { ...BASIC };
    expect(await restrictFiltersToTier('user-1', filters)).toBe(filters);
    expect(TierService.isProUser).not.toHaveBeenCalled();
  });

  test('_buildWhereClause ignores advanced filters for free users', async () => {
    TierService.isProUser.mockResolvedValue(false);
    const { whereClause, values } = await TradeQueries._buildWhereClause('user-1', {
      symbol: 'AAPL',
      daysOfWeek: [1],
      minPnl: 100,
      qualityGrades: ['A']
    });

    expect(whereClause).not.toMatch(/quality_grade/);
    expect(whereClause).not.toMatch(/DOW/i);
    expect(values).not.toContain(100);
    expect(values).toContain('AAPL');
  });

  test('_buildWhereClause applies advanced filters for Pro users', async () => {
    TierService.isProUser.mockResolvedValue(true);
    const { whereClause, values } = await TradeQueries._buildWhereClause('user-1', {
      symbol: 'AAPL',
      minPnl: 100,
      qualityGrades: ['A']
    });

    expect(whereClause).toMatch(/quality_grade/);
    expect(values).toContain(100);
  });
});
