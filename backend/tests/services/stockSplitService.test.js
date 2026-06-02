jest.mock('../../src/models/StockSplit', () => ({
  getSymbolsToCheck: jest.fn(),
  updateCheckLog: jest.fn(),
  findUnprocessed: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({}));
jest.mock('../../src/utils/finnhub', () => ({
  getStockSplits: jest.fn()
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
