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
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{
        id: 'd37db745-a0f8-4634-83e2-a0b8e468e7de', symbol: 'AAPL',
        ...example.trade, stop_loss: example.expected_stop_loss
      }] })
      .mockResolvedValueOnce({ rowCount: 1 }) };
    db.withTransaction.mockImplementation(callback => callback(client));

    const result = await Backfill.runBatch('user-1');

    expect(result).toEqual({ updated: 1, cleared_stops: 0, next_after: null });
    expect(client.query.mock.calls[2][1]).toEqual([
      example.expected_r_value, 'd37db745-a0f8-4634-83e2-a0b8e468e7de', 'user-1'
    ]);
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith('user-1');
  });

  it('clears nonpositive stops for this user on the first batch only', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rows: [] }) };
    db.withTransaction.mockImplementation(callback => callback(client));

    const result = await Backfill.runBatch('user-1');

    expect(client.query.mock.calls[0][0]).toContain('stop_loss <= 0');
    expect(client.query.mock.calls[0][1]).toEqual(['user-1']);
    expect(result).toEqual({ updated: 0, cleared_stops: 2, next_after: null });
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith('user-1');

    client.query.mockReset().mockResolvedValueOnce({ rows: [] });
    await Backfill.runBatch('user-1', 'd37db745-a0f8-4634-83e2-a0b8e468e7de');
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
