jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/models/BrokerConnection', () => ({
  findById: jest.fn()
}));

jest.mock('../../src/services/analyticsCache', () => ({
  invalidate: jest.fn()
}));

jest.mock('../../src/services/optionStrategyGroupingService', () => ({
  rebuildUserGroupsSafe: jest.fn()
}));

jest.mock('../../src/services/brokerSync/ibkrService', () => ({}));
jest.mock('../../src/services/brokerSync/schwabService', () => ({}));
jest.mock('../../src/services/brokerSync/tradestationService', () => ({}));
jest.mock('../../src/services/brokerSync/alpacaService', () => ({}));
jest.mock('../../src/services/brokerSync', () => ({}));
jest.mock('../../src/services/tierService', () => ({}));

const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');
const AnalyticsCache = require('../../src/services/analyticsCache');
const OptionStrategyGroupingService = require('../../src/services/optionStrategyGroupingService');
const brokerSyncController = require('../../src/controllers/brokerSync.controller');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
}

describe('brokerSyncController.deleteBrokerTrades', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('deletes legacy IBKR rows when broker_connection_id is missing', async () => {
    BrokerConnection.findById.mockResolvedValue({
      id: 'conn-1',
      userId: 'user-1',
      brokerType: 'ibkr'
    });
    db.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 2, rows: [{ id: 'trade-1' }, { id: 'trade-2' }] });

    const req = { user: { id: 'user-1' }, params: { id: 'conn-1' } };
    const res = createRes();
    const next = jest.fn();

    await brokerSyncController.deleteBrokerTrades(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[0][0]).toContain('broker_connection_id = $2');
    expect(db.query.mock.calls[0][1]).toEqual(['user-1', 'conn-1']);

    const [legacySql, legacyParams] = db.query.mock.calls[1];
    expect(legacySql).toContain('broker_connection_id IS NULL');
    expect(legacySql).toContain('LOWER(broker) = LOWER($2)');
    expect(legacySql).not.toContain('import_id IS NULL');
    expect(legacyParams).toEqual(['user-1', 'ibkr']);

    expect(OptionStrategyGroupingService.rebuildUserGroupsSafe).toHaveBeenCalledWith('user-1', 'broker trade deletion');
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith('user-1');
    expect(res.payload).toEqual({
      success: true,
      message: 'Deleted 2 synced trades from ibkr',
      deletedCount: 2,
      legacyDeletedCount: 2
    });
  });

  test('does not run legacy fallback for non-IBKR connections', async () => {
    BrokerConnection.findById.mockResolvedValue({
      id: 'conn-1',
      userId: 'user-1',
      brokerType: 'schwab'
    });
    db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const req = { user: { id: 'user-1' }, params: { id: 'conn-1' } };
    const res = createRes();
    const next = jest.fn();

    await brokerSyncController.deleteBrokerTrades(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(OptionStrategyGroupingService.rebuildUserGroupsSafe).not.toHaveBeenCalled();
    expect(AnalyticsCache.invalidate).not.toHaveBeenCalled();
    expect(res.payload).toMatchObject({
      success: true,
      deletedCount: 0,
      legacyDeletedCount: 0
    });
  });
});
