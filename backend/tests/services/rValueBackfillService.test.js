jest.mock('../../src/config/database', () => ({ withTransaction: jest.fn() }));
jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn() }));

const db = require('../../src/config/database');
const AnalyticsCache = require('../../src/services/analyticsCache');
const Backfill = require('../../src/services/rValueBackfillService');
const example = require('../../../tests/fixtures/trading-calculation-contracts.json').r_value.bulk_stop_preview_example;

describe('missing R-value backfill', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists net R from the current stop and invalidates analytics', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{
        id: 'd37db745-a0f8-4634-83e2-a0b8e468e7de', symbol: 'AAPL',
        ...example.trade, stop_loss: example.expected_stop_loss
      }] })
      .mockResolvedValueOnce({ rowCount: 1 }) };
    db.withTransaction.mockImplementation(callback => callback(client));

    const result = await Backfill.runBatch('user-1');

    expect(result).toEqual({ updated: 1, next_after: null });
    expect(client.query.mock.calls[1][1]).toEqual([
      example.expected_r_value, 'd37db745-a0f8-4634-83e2-a0b8e468e7de', 'user-1'
    ]);
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith('user-1');
  });
});
