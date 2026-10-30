jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn().mockResolvedValue('America/New_York'),
  getUserLocalDate: jest.fn()
}));

jest.mock('../../src/services/achievementService', () => ({
  checkAndAwardAchievements: jest.fn().mockResolvedValue([]),
  updateTradingStreak: jest.fn().mockResolvedValue(null)
}));

const db = require('../../src/config/database');
const Trade = require('../../src/models/Trade');
const User = require('../../src/models/User');

describe('Trade.create', () => {
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({
      rows: [{
        id: 'trade-1',
        symbol: 'AAPL',
        trade_date: '2026-06-01',
        entry_time: new Date('2026-06-01T14:30:00.000Z'),
        exit_time: null
      }]
    });
  });

  it('derives trade_date when entryTime is a Date object', async () => {
    await Trade.create('user-1', {
      symbol: 'AAPL',
      side: 'long',
      quantity: 10,
      entryPrice: 100,
      entryTime: new Date('2026-06-01T14:30:00.000Z')
    }, { skipApiCalls: true });

    const insertCall = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO trades'));
    expect(insertCall).toBeDefined();
    expect(insertCall[1][2]).toBe('2026-06-01');
  });

  it('applies the instrument point default on creation while preserving explicit stops', async () => {
    jest.spyOn(User, 'getSettings').mockResolvedValue({
      default_stop_loss_type: 'points', default_stop_loss_points: 2,
      default_stop_loss_points_by_underlying: { ES: 1.5 }
    });
    for (const stop_loss of [undefined, 5995]) {
      await Trade.create('user-1', {
        symbol: 'ESZ6', instrumentType: 'future', side: 'long', quantity: 3,
        entryPrice: 6000, entryTime: '2026-10-15T14:00:00Z', stopLoss: stop_loss
      }, { skipApiCalls: true, skipStrategyClassification: true });
    }
    const inserts = db.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO trades'));
    for (const [index, [sql, params]] of inserts.entries()) {
      const columns = sql.match(/INSERT INTO trades\s*\(([\s\S]*?)\)/)[1].split(',').map(column => column.trim());
      expect(params[columns.indexOf('stop_loss')]).toBe(index === 0 ? 5998.5 : 5995);
    }
  });

  it('leaves strategy blank when automatic import classification is disabled', async () => {
    const classifySpy = jest.spyOn(Trade, 'classifyTradeBasic');

    await Trade.create('user-1', {
      symbol: 'MESU6',
      side: 'long',
      quantity: 1,
      entryPrice: 6800,
      entryTime: new Date('2026-06-01T14:30:00.000Z')
    }, { skipApiCalls: true, skipStrategyClassification: true });

    const insertCall = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO trades'));
    expect(insertCall[1][18]).toBe('');
    expect(insertCall[1][26]).toBe('none');
    expect(classifySpy).not.toHaveBeenCalled();
    classifySpy.mockRestore();
  });
});

describe('Trade.create option field validation (check_options_fields)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [{ id: 'trade-opt', symbol: 'AAPL', trade_date: '2026-06-01', entry_time: new Date('2026-06-01T14:30:00.000Z'), exit_time: null }] });
  });

  it('rejects an option without strike/expiration/type/underlying with a 400 AppError', async () => {
    await expect(Trade.create('user-1', {
      symbol: 'AAPL',
      side: 'long',
      quantity: 1,
      entryPrice: 2.5,
      entryTime: new Date('2026-06-01T14:30:00.000Z'),
      instrumentType: 'option'
    })).rejects.toMatchObject({
      isAppError: true,
      statusCode: 400,
      body: { missing_fields: ['strikePrice', 'expirationDate', 'optionType', 'underlyingSymbol'] }
    });
    expect(db.query.mock.calls.some(([sql]) => /INSERT INTO trades/.test(sql))).toBe(false);
  });

  it('fills missing option fields from an OCC symbol', async () => {
    await Trade.create('user-1', {
      symbol: 'AAPL  260117C00200000',
      side: 'long',
      quantity: 1,
      entryPrice: 2.5,
      entryTime: new Date('2026-06-01T14:30:00.000Z'),
      instrumentType: 'option'
    });
    const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO trades/.test(sql));
    expect(insert).toBeDefined();
    const values = insert[1];
    expect(values).toEqual(expect.arrayContaining([200, '2026-01-17', 'call', 'AAPL']));
  });
});
