jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(async callback => callback(require('../../src/config/database')))
}));
jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn() }));

const db = require('../../src/config/database');
const AnalyticsCache = require('../../src/services/analyticsCache');
const BulkTradeStops = require('../../src/services/bulkTradeStopsService');
const contract = require('../../../tests/fixtures/trading-calculation-contracts.json').r_value.bulk_stop_preview_example;

const id = 'd37db745-a0f8-4634-83e2-a0b8e468e7de';
const trade = { id, symbol: 'AAPL', ...contract.trade, stop_loss: null };

describe('bulk stop editing', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('previews default stops and net R without taking write locks', async () => {
    db.query.mockResolvedValueOnce({ rows: [trade] })
      .mockResolvedValueOnce({ rows: [{ default_stop_loss_type: 'percent', default_stop_loss_percent: contract.default_stop_loss_percent }] });

    const result = await BulkTradeStops.preview('user-1', [id], [], true);

    expect(result.changes).toEqual([{
      trade_id: id,
      stop_loss: contract.expected_stop_loss,
      risk_amount: contract.expected_risk_amount,
      r_value: contract.expected_r_value
    }]);
    expect(db.withTransaction).not.toHaveBeenCalled();
    expect(db.query.mock.calls[0][0]).not.toContain('FOR UPDATE');
    expect(AnalyticsCache.invalidate).not.toHaveBeenCalled();
  });

  it('saves an explicit stop and invalidates analytics', async () => {
    db.query.mockResolvedValueOnce({ rows: [trade] }).mockResolvedValueOnce({ rowCount: 1 });

    const result = await BulkTradeStops.update('user-1', [id], [{ trade_id: id, stop_loss: 95 }], false);

    expect(result.updated_trade_count).toBe(1);
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(db.query.mock.calls[1][0]).toContain('UPDATE trades SET stop_loss');
    expect(db.query.mock.calls[1][1]).toEqual([95, contract.expected_r_value, id, 'user-1']);
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith('user-1');
  });

  it('preserves existing stops when filling missing defaults', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...trade, stop_loss: 94 }] })
      .mockResolvedValueOnce({ rows: [{ default_stop_loss_type: 'percent', default_stop_loss_percent: 5 }] });

    const result = await BulkTradeStops.preview('user-1', [id], [], true);

    expect(result.updated_trade_count).toBe(0);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed stop entries before querying trades', async () => {
    await expect(BulkTradeStops.preview('user-1', [id], [{ trade_id: 123, stop_loss: 95 }], false))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(db.query).not.toHaveBeenCalled();
  });
});
