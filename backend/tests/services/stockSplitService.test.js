jest.mock('../../src/models/StockSplit', () => ({
  getSymbolsToCheck: jest.fn(),
  updateCheckLog: jest.fn(),
  findUnprocessed: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({}));
jest.mock('../../src/utils/finnhub', () => ({
  getStockSplits: jest.fn()
}));
jest.mock('../../src/services/marketDataActivityService', () => ({
  getActiveUserIdArray: jest.fn().mockResolvedValue(['user-1'])
}));
jest.mock('../../src/config/database', () => ({
  pool: {
    connect: jest.fn()
  }
}));

const StockSplit = require('../../src/models/StockSplit');
const finnhub = require('../../src/utils/finnhub');
const stockSplitService = require('../../src/services/stockSplitService');

describe('stockSplitService Finnhub scheduling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    StockSplit.getSymbolsToCheck.mockResolvedValue(['AAPL']);
    StockSplit.findUnprocessed.mockResolvedValue([]);
  });

  test('checks active users\' positions weekly and waits in the provider queue', async () => {
    finnhub.getStockSplits.mockResolvedValue([]);

    await stockSplitService.checkForStockSplits();

    expect(StockSplit.getSymbolsToCheck).toHaveBeenCalledWith(7 * 24, ['user-1']);
    expect(finnhub.getStockSplits).toHaveBeenCalledWith('AAPL', expect.any(String), expect.any(String), expect.objectContaining({
      priority: 9,
      background: true,
      maxQueueWaitMs: 5 * 60 * 1000
    }));
    expect(StockSplit.updateCheckLog).toHaveBeenCalledWith('AAPL', 0);
  });

  test('stops the run once the provider stays saturated instead of spinning through every symbol', async () => {
    StockSplit.getSymbolsToCheck.mockResolvedValue(['AAPL', 'MSFT', 'TSLA']);
    finnhub.getStockSplits
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce({ code: 'FINNHUB_SCHEDULER_SKIPPED', message: 'saturated' });

    await expect(stockSplitService.checkForStockSplits()).resolves.toMatchObject({
      checked: 1,
      skipped: 2
    });
    expect(finnhub.getStockSplits).toHaveBeenCalledTimes(2);
  });

  test('defers saturated split checks without marking the symbol checked', async () => {
    finnhub.getStockSplits.mockRejectedValue({
      code: 'FINNHUB_SCHEDULER_SKIPPED',
      message: 'provider capacity reserved for active requests'
    });

    await expect(stockSplitService.checkForStockSplits()).resolves.toMatchObject({
      checked: 0,
      splitsFound: 0,
      skipped: 1
    });

    expect(StockSplit.updateCheckLog).not.toHaveBeenCalled();
  });
});
