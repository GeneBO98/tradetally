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

describe('Trade.create', () => {
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
