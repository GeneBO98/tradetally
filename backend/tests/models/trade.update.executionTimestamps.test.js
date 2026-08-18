jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn().mockResolvedValue('Europe/Berlin'),
  getUserLocalDate: jest.fn().mockResolvedValue('2026-08-05')
}));

jest.mock('../../src/services/achievementService', () => ({
  checkAndAwardAchievements: jest.fn().mockResolvedValue([]),
  updateTradingStreak: jest.fn().mockResolvedValue(null)
}));

jest.mock('../../src/services/optionStrategyGroupingService', () => ({
  rebuildUserGroupsSafe: jest.fn().mockResolvedValue(null)
}));

jest.mock('../../src/services/pnlEngine', () => ({
  computeTradePnl: jest.fn(({ executions }) => ({
    annotatedExecutions: executions,
    aggregate: {
      pnl: 9,
      pnl_percent: 0,
      commission: 6,
      fees: 0,
      entry_price: 7799.5,
      exit_price: 7800,
      quantity: 6,
      entry_time: executions[0].datetime,
      exit_time: executions[1].datetime,
      trade_date: '2026-08-05',
      is_fully_closed: true
    }
  }))
}));

const db = require('../../src/config/database');
const Trade = require('../../src/models/Trade');
const { schemas } = require('../../src/middleware/validation');
const { buildExistingTradeIndex, classifyImportTrade } = require('../../src/utils/importDuplicateDetection');

describe('Trade.update execution timestamp preservation', () => {
  const originalExecutions = [
    {
      action: 'buy',
      quantity: 6,
      price: 7799.5,
      datetime: '2026-08-05T12:11:02.000Z',
      orderId: '587041972157',
      commission: 3,
      fees: 0
    },
    {
      action: 'sell',
      quantity: 6,
      price: 7800,
      datetime: '2026-08-05T12:31:05.000Z',
      orderId: '587041972165',
      commission: 3,
      fees: 0
    }
  ];

  const currentTrade = {
    id: 'trade-385',
    user_id: 'user-1',
    symbol: 'MESU6',
    side: 'long',
    quantity: 6,
    entry_price: 7799.5,
    exit_price: 7800,
    entry_time: originalExecutions[0].datetime,
    exit_time: originalExecutions[1].datetime,
    trade_date: '2026-08-05',
    pnl: 9,
    commission: 6,
    fees: 0,
    stop_loss: 7797,
    take_profit: 7802,
    instrument_type: 'future',
    point_value: 5,
    tick_size: 0.25,
    underlying_asset: 'MES',
    executions: originalExecutions
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Trade, 'findById').mockResolvedValue(currentTrade);
    db.query.mockResolvedValue({ rows: [{ ...currentTrade }] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const getPersistedExecutions = () => {
    const updateCall = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE trades'));
    expect(updateCall).toBeDefined();

    const persistedExecutionJson = updateCall[1].find(value =>
      typeof value === 'string' && value.includes('587041972157')
    );
    return JSON.parse(persistedExecutionJson);
  };

  test('keeps broker seconds after a Joi-validated minute-precision edit so re-import dedup still matches', async () => {
    const { error, value: validatedUpdate } = schemas.updateTrade.validate({
      executions: originalExecutions.map(execution => ({
        ...execution,
        // datetime-local inputs submit minute precision after the local-to-UTC conversion.
        datetime: execution.datetime.replace(/:\d{2}\.000Z$/, ':00.000Z')
      }))
    });

    expect(error).toBeUndefined();
    expect(validatedUpdate.executions[0].datetime).toBeInstanceOf(Date);

    await Trade.update('trade-385', 'user-1', validatedUpdate, {
      skipAchievements: true,
      skipOptionGrouping: true
    });

    const persistedExecutions = getPersistedExecutions();

    expect(persistedExecutions.map(execution => execution.datetime)).toEqual([
      '2026-08-05T12:11:02.000Z',
      '2026-08-05T12:31:05.000Z'
    ]);

    const laterImport = {
      symbol: 'MESU6',
      instrumentType: 'future',
      side: 'long',
      quantity: 6,
      entryPrice: 7799.5,
      exitPrice: 7800,
      pnl: 9,
      entryTime: originalExecutions[0].datetime,
      exitTime: originalExecutions[1].datetime,
      executionData: originalExecutions
    };
    const existingIndex = buildExistingTradeIndex([{
      id: 'trade-385',
      symbol: 'MESU6',
      instrument_type: 'future',
      side: 'long',
      quantity: 6,
      entry_price: 7799.5,
      exit_price: 7800,
      entry_time: persistedExecutions[0].datetime,
      pnl: 9,
      executions: persistedExecutions
    }]);

    expect(classifyImportTrade(laterImport, existingIndex).is_duplicate).toBe(true);
  });

  test('keeps an intentional execution change that moves to a different minute', async () => {
    const { error, value: validatedUpdate } = schemas.updateTrade.validate({
      executions: [
        {
          ...originalExecutions[0],
          datetime: '2026-08-05T12:12:00.000Z'
        },
        {
          ...originalExecutions[1],
          datetime: '2026-08-05T12:31:00.000Z'
        }
      ]
    });

    expect(error).toBeUndefined();

    await Trade.update('trade-385', 'user-1', validatedUpdate, {
      skipAchievements: true,
      skipOptionGrouping: true
    });

    const persistedExecutions = getPersistedExecutions();
    expect(persistedExecutions.map(execution => execution.datetime)).toEqual([
      '2026-08-05T12:12:00.000Z',
      '2026-08-05T12:31:05.000Z'
    ]);
  });
});
