jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const db = require('../../src/config/database');
const tradeManagementController = require('../../src/controllers/tradeManagement.controller');

function createMockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('trade management controller sync filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('selection query handles Unsorted account and returns exit_time for UI date display', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });

    const req = {
      user: { id: 'user-1' },
      query: {
        startDate: '2026-05-01',
        endDate: '2026-05-11',
        symbol: 'AAPL',
        accounts: '__unsorted__',
        limit: '25',
        offset: '0'
      }
    };
    const res = createMockRes();

    await tradeManagementController.getTradesForSelection(req, res);

    const selectionSql = db.query.mock.calls[0][0];
    const countSql = db.query.mock.calls[1][0];

    expect(selectionSql).toContain('WITH numbered_trades AS');
    expect(selectionSql).toContain('LEFT JOIN numbered_trades');
    expect(selectionSql).toContain('t.exit_time');
    expect(selectionSql).toContain("(t.account_identifier IS NULL OR t.account_identifier = '')");
    expect(countSql).toContain("(t.account_identifier IS NULL OR t.account_identifier = '')");
    expect(res.json).toHaveBeenCalledWith({
      trades: [],
      pagination: {
        total: 0,
        limit: 25,
        offset: 0,
        has_more: false
      }
    });
  });

  test('R performance query handles Unsorted account filter consistently', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: 'user-1' },
      query: {
        accounts: '__unsorted__',
        limit: '50'
      }
    };
    const res = createMockRes();

    await tradeManagementController.getRPerformance(req, res);

    const rPerformanceSql = db.query.mock.calls
      .map(call => call[0])
      .find(sql => typeof sql === 'string' && sql.includes('FROM trades t'));
    expect(rPerformanceSql).toContain("(t.account_identifier IS NULL OR t.account_identifier = '')");
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      chart_data: [],
      summary: expect.objectContaining({
        total_trades: 0
      })
    }));
  });
});
