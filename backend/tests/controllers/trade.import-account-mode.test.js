jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/Account', () => ({
  findById: jest.fn(),
  update: jest.fn()
}));
jest.mock('../../src/utils/imageProcessor', () => ({}));
jest.mock('../../src/services/tierService', () => ({}));

const db = require('../../src/config/database');
const Account = require('../../src/models/Account');
const tradeController = require('../../src/controllers/trade.controller');

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

function createRequest(body) {
  return {
    user: { id: '8ee4d3cc-4287-48f8-a29f-5f3c9f887ff1' },
    headers: { 'content-type': 'multipart/form-data' },
    body,
    file: {
      originalname: 'trades.csv',
      mimetype: 'text/csv',
      size: 10,
      buffer: Buffer.from('Symbol\nMES')
    }
  };
}

describe('trade import account override validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects override mode when no account ID was supplied', async () => {
    const req = createRequest({ broker: 'sierrachart', account_mode: 'override' });
    const res = createResponse();
    const next = jest.fn();

    await tradeController.importTrades(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: 'A valid account is required when account_mode is override' });
    expect(Account.findById).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects override mode when the selected account is not owned by the user', async () => {
    const accountId = '53252813-42b8-4b7b-b18c-5fa615108a5f';
    Account.findById.mockResolvedValue(undefined);
    const req = createRequest({
      broker: 'sierrachart',
      account_mode: 'override',
      accountId
    });
    const res = createResponse();
    const next = jest.fn();

    await tradeController.importTrades(req, res, next);

    expect(Account.findById).toHaveBeenCalledWith(accountId, req.user.id);
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: 'Selected account was not found' });
    expect(db.query).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
