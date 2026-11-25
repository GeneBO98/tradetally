jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  logError: jest.fn()
}));

jest.mock('../../src/services/csvMappingSuggestionService', () => ({
  suggest: jest.fn()
}));

const db = require('../../src/config/database');
const CsvMappingSuggestionService = require('../../src/services/csvMappingSuggestionService');
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

  describe('suggestMapping', () => {
    it('returns the AI suggestion for the posted headers', async () => {
      CsvMappingSuggestionService.suggest.mockResolvedValue({ mapping: { symbol_column: 'Instrument' }, matched: 1 });
      const req = { user: { id: 'user-1' }, body: { headers: ['Instrument', 'Lots'], sampleRows: { Instrument: ['EURUSD'] } } };
      const res = createResponse();

      await csvMappingController.suggestMapping(req, res, jest.fn());

      expect(CsvMappingSuggestionService.suggest).toHaveBeenCalledWith('user-1', {
        headers: ['Instrument', 'Lots'],
        sampleRows: { Instrument: ['EURUSD'] }
      }, { isCancelled: expect.any(Function) });
      expect(res.statusCode).toBe(200);
      expect(res.payload).toEqual({ success: true, data: { mapping: { symbol_column: 'Instrument' }, matched: 1 } });
    });

    it('passes the service status and code through for expected failures', async () => {
      const error = Object.assign(new Error('Insufficient AI credits'), { status: 402, code: 'INSUFFICIENT_CREDITS' });
      CsvMappingSuggestionService.suggest.mockRejectedValue(error);
      const res = createResponse();
      const next = jest.fn();

      await csvMappingController.suggestMapping({ user: { id: 'user-1' }, body: {} }, res, next);

      expect(res.statusCode).toBe(402);
      expect(res.payload).toEqual({ success: false, code: 'INSUFFICIENT_CREDITS', error: 'Insufficient AI credits' });
      expect(next).not.toHaveBeenCalled();
    });

    it('hands unexpected errors to the error middleware', async () => {
      const error = new Error('boom');
      CsvMappingSuggestionService.suggest.mockRejectedValue(error);
      const next = jest.fn();

      await csvMappingController.suggestMapping({ user: { id: 'user-1' }, body: {} }, createResponse(), next);

      expect(next).toHaveBeenCalledWith(error);
    });
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
      expect(db.query.mock.calls[1][1][12]).toBeNull();
      expect(db.query.mock.calls[1][1][15]).toBeNull();
      expect(db.query.mock.calls[1][1][16]).toBeNull();
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
      expect(db.query.mock.calls[1][1][15]).toBe('Stop Loss');
      expect(db.query.mock.calls[1][1][16]).toBe('Take Profit');
      expect(res.statusCode).toBe(201);
      expect(res.payload.success).toBe(true);
    });

    it('creates a mapping with separate commission and fees columns', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'mapping-3',
            mapping_name: 'Generic Separate Costs',
            commission_column: 'Commission',
            fees_column: 'Fees'
          }]
        });

      const req = {
        user: { id: 'user-1' },
        body: {
          mapping_name: 'Generic Separate Costs',
          symbol_column: 'Symbol',
          quantity_column: 'Quantity',
          entry_price_column: 'Entry Price',
          commission_column: 'Commission',
          fees_column: 'Fees'
        }
      };
      const res = createResponse();
      const next = jest.fn();

      await csvMappingController.createMapping(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledTimes(2);
      expect(db.query.mock.calls[1][1][12]).toBe('Commission');
      expect(db.query.mock.calls[1][1][13]).toBe('Fees');
      expect(res.statusCode).toBe(201);
      expect(res.payload.success).toBe(true);
    });
  });
});
