jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const cusipMappingsController = require('../../src/controllers/cusipMappings.controller');

function createResponse() {
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

describe('cusipMappingsController.getUserCusipMappings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes user-created mappings even before a trade uses them', async () => {
    db.query.mockImplementation((sql) => {
      if (sql.includes('SELECT COUNT(*) as total')) {
        return Promise.resolve({ rows: [{ total: '1' }] });
      }

      return Promise.resolve({
        rows: [{
          cusip: 'ZX8401380',
          ticker: 'ZZUI',
          resolution_source: 'manual',
          verified: true,
          is_user_override: true,
          trade_count: 0
        }]
      });
    });

    const req = {
      user: { id: 'user-1' },
      query: { search: 'ZX8401380', limit: '1' }
    };
    const res = createResponse();
    const next = jest.fn();

    await cusipMappingsController.getUserCusipMappings(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[0][0]).toContain('Get user-created mappings even before any trade uses them');
    expect(db.query.mock.calls[1][0]).toContain('Get user-created mappings even before any trade uses them');
    expect(res.payload.data).toEqual([
      expect.objectContaining({
        cusip: 'ZX8401380',
        ticker: 'ZZUI',
        trade_count: 0
      })
    ]);
    expect(res.payload.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1
    });
  });
});
