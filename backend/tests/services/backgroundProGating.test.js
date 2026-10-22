// Background jobs that do Pro-only work must skip users who are not Pro.
// TierService.filterProUserIds / isProUser already return everyone when
// billing is disabled (self-hosted), so these tests only cover the filtering.

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  logImport: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logDebug: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));
jest.mock('../../src/utils/finnhub', () => ({ providerName: 'finnhub' }));
jest.mock('../../src/utils/alphaVantage', () => ({}));
jest.mock('../../src/utils/historicalPriceCache', () => ({
  getUnavailableSymbols: jest.fn(),
  getRange: jest.fn()
}));
jest.mock('../../src/services/tierService', () => ({
  filterProUserIds: jest.fn(),
  isProUser: jest.fn()
}));
jest.mock('../../src/services/eightPillarsService', () => ({ analyzeStock: jest.fn() }));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const historicalPriceCache = require('../../src/utils/historicalPriceCache');
const EightPillarsService = require('../../src/services/eightPillarsService');
const DividendService = require('../../src/services/dividendService');
const watchlistPillarsScheduler = require('../../src/services/watchlistPillarsScheduler');
const PortfolioService = require('../../src/services/portfolioService');
const jobQueue = require('../../src/utils/jobQueue');

const onlyPro = async ids => [...new Set(ids.map(String))].filter(id => id.startsWith('pro'));

describe('background Pro gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    TierService.filterProUserIds.mockImplementation(onlyPro);
  });

  test('dividend processing only runs for Pro users', async () => {
    jest.spyOn(DividendService, 'getSymbolsWithOpenTrades').mockResolvedValue([
      { symbol: 'AAPL', userIds: ['free-1', 'pro-1'] },
      { symbol: 'KO', userIds: ['free-2'] }
    ]);
    jest.spyOn(DividendService, 'sleep').mockResolvedValue();
    const processSpy = jest.spyOn(DividendService, 'processUserSymbolDividends')
      .mockResolvedValue({ recorded: 0, skipped: 0, errors: 0 });

    const summary = await DividendService.processAllDividends();

    expect(processSpy).toHaveBeenCalledTimes(1);
    expect(processSpy).toHaveBeenCalledWith('pro-1', 'AAPL');
    expect(summary.symbolsProcessed).toBe(1);
  });

  test('watchlist pillars only pre-compute symbols on Pro users\' watchlists', async () => {
    db.query.mockResolvedValue({
      rows: [
        { symbol: 'tsla', user_id: 'free-1' },
        { symbol: 'nvda', user_id: 'pro-1' }
      ]
    });
    EightPillarsService.analyzeStock.mockResolvedValue({});

    await watchlistPillarsScheduler.execute();

    expect(EightPillarsService.analyzeStock).toHaveBeenCalledTimes(1);
    expect(EightPillarsService.analyzeStock).toHaveBeenCalledWith('NVDA');
  });

  test('daily portfolio snapshots only run for Pro users', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'free-1' }, { id: 'pro-1' }] });
    const snapshotSpy = jest.spyOn(PortfolioService, 'createDailySnapshotsForUser')
      .mockResolvedValue({ userId: 'pro-1' });

    const result = await PortfolioService.createDailySnapshotsForAllUsers('2026-10-01');

    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    expect(snapshotSpy).toHaveBeenCalledWith('pro-1', '2026-10-01');
    expect(result.usersProcessed).toBe(1);
  });

  test('nightly price-history pre-warm only covers Pro users\' symbols and benchmarks', async () => {
    db.query.mockImplementation(async sql => {
      if (sql.includes('portfolio_preferences')) {
        return { rows: [{ symbol: 'QQQ', user_id: 'free-1' }, { symbol: 'DIA', user_id: 'pro-1' }] };
      }
      return {
        rows: [
          { symbol: 'TSLA', user_id: 'free-1', earliest: '2026-01-05' },
          { symbol: 'NVDA', user_id: 'pro-1', earliest: '2026-02-02' }
        ]
      };
    });
    // Mark everything unavailable so no provider call is attempted.
    historicalPriceCache.getUnavailableSymbols.mockResolvedValue(new Set(['DIA', 'NVDA', 'SPY', 'QQQ', 'TSLA']));
    historicalPriceCache.getRange.mockResolvedValue([]);

    const summary = await PortfolioService.refreshHeldSymbolHistory('2026-10-01');

    const requested = historicalPriceCache.getRange.mock.calls.map(([symbol]) => symbol).sort();
    expect(requested).toEqual(['DIA', 'NVDA', 'SPY']);
    expect(summary).toEqual(expect.objectContaining({ symbols: 3, skipped: 3, failed: 0 }));
  });

  test('MAE recalc stops without re-enqueueing for non-Pro users', async () => {
    TierService.isProUser.mockResolvedValue(false);
    const addJobSpy = jest.spyOn(jobQueue, 'addJob').mockResolvedValue('job-1');

    const result = await jobQueue.processMAERecalc({ userId: 'free-1' });

    expect(result.skipped).toBe(true);
    expect(db.query).not.toHaveBeenCalled();
    expect(addJobSpy).not.toHaveBeenCalled();
  });

  test('MAE recalc proceeds for Pro users', async () => {
    TierService.isProUser.mockResolvedValue(true);
    db.query.mockResolvedValue({ rows: [] });

    await jobQueue.processMAERecalc({ userId: 'pro-1' });

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual(['pro-1']);
  });
});
