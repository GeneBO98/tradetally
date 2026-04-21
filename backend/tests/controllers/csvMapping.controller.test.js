jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  logError: jest.fn()
}));

const db = require('../../src/config/database');
const csvMappingController = require('../../src/controllers/csvMapping.controller');

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

describe('csvMapping controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createMapping', () => {
    it('creates a mapping when stop-loss fields are omitted', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'mapping-1',
            mapping_name: 'Generic Options',
            stop_loss_column: null,
            take_profit_column: null
          }]
        });

      const req = {
        user: { id: 'user-1' },
        body: {
          mapping_name: 'Generic Options',
          symbol_column: 'Symbol',
          quantity_column: 'Quantity',
          entry_price_column: 'Entry Price',
          notes_column: 'Notes'
        }
      };
      const res = createResponse();
      const next = jest.fn();

      await csvMappingController.createMapping(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledTimes(2);
      expect(db.query.mock.calls[1][1][14]).toBeNull();
      expect(db.query.mock.calls[1][1][15]).toBeNull();
      expect(res.statusCode).toBe(201);
      expect(res.payload.success).toBe(true);
    });

    it('creates a mapping when stop-loss and take-profit columns are provided', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'mapping-2',
            mapping_name: 'Generic Options With Risk',
            stop_loss_column: 'Stop Loss',
            take_profit_column: 'Take Profit'
          }]
        });

      const req = {
        user: { id: 'user-1' },
        body: {
          mapping_name: 'Generic Options With Risk',
          symbol_column: 'Symbol',
          quantity_column: 'Quantity',
          entry_price_column: 'Entry Price',
          stop_loss_column: 'Stop Loss',
          take_profit_column: 'Take Profit'
        }
      };
      const res = createResponse();
      const next = jest.fn();

      await csvMappingController.createMapping(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledTimes(2);
      expect(db.query.mock.calls[1][1][14]).toBe('Stop Loss');
      expect(db.query.mock.calls[1][1][15]).toBe('Take Profit');
      expect(res.statusCode).toBe(201);
      expect(res.payload.success).toBe(true);
    });
  });
});
