// Upload paths (uploadAttachment, uploadTradeImages, addTradeChart) gate on
// Trade.findById which accepts public trades. A reviewer must not be able to
// attach files to someone else's public trade just because the trade is
// visible to them.

jest.mock('../../src/models/Trade', () => ({
  findById: jest.fn(),
  addAttachment: jest.fn(),
  addChart: jest.fn()
}));
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/imageProcessor', () => ({
  validateImage: jest.fn(),
  processImage: jest.fn(),
  saveImage: jest.fn()
}));
jest.mock('../../src/services/tierService', () => ({}));

const Trade = require('../../src/models/Trade');
const tradeController = require('../../src/controllers/trade.controller');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

describe('Trade upload paths reject non-owned public trades', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uploadAttachment returns 404 when trade is public but not owned by caller', async () => {
    // findById permissively returns the public trade; controller must still reject
    Trade.findById.mockResolvedValue({
      id: 'trade-1',
      user_id: 'owner-real',
      is_public: true
    });

    const req = {
      params: { id: 'trade-1' },
      user: { id: 'attacker' },
      file: { filename: 'evil.jpg', mimetype: 'image/jpeg', originalname: 'evil.jpg', size: 100 }
    };
    const res = createRes();
    await tradeController.uploadAttachment(req, res, jest.fn());

    expect(res.statusCode).toBe(404);
    expect(Trade.addAttachment).not.toHaveBeenCalled();
  });

  test('uploadTradeImages returns 404 when trade is public but not owned by caller', async () => {
    Trade.findById.mockResolvedValue({
      id: 'trade-1',
      user_id: 'owner-real',
      is_public: true
    });

    const req = {
      params: { id: 'trade-1' },
      user: { id: 'attacker' },
      files: [{ buffer: Buffer.from(''), originalname: 'x.jpg' }]
    };
    const res = createRes();
    await tradeController.uploadTradeImages(req, res, jest.fn());

    expect(res.statusCode).toBe(404);
    expect(Trade.addAttachment).not.toHaveBeenCalled();
  });

  test('addTradeChart returns 404 when trade is public but not owned by caller', async () => {
    Trade.findById.mockResolvedValue({
      id: 'trade-1',
      user_id: 'owner-real',
      is_public: true
    });

    const req = {
      params: { id: 'trade-1' },
      user: { id: 'attacker' },
      body: { chartUrl: 'https://evil.example/chart.png', chartTitle: 'evil' }
    };
    const res = createRes();
    await tradeController.addTradeChart(req, res, jest.fn());

    expect(res.statusCode).toBe(404);
    expect(Trade.addChart).not.toHaveBeenCalled();
  });

  test('uploadAttachment succeeds when caller owns the trade', async () => {
    Trade.findById.mockResolvedValue({
      id: 'trade-1',
      user_id: 'owner-real',
      is_public: false
    });
    Trade.addAttachment.mockResolvedValue({ id: 'att-1' });

    const req = {
      params: { id: 'trade-1' },
      user: { id: 'owner-real' },
      file: { filename: 'ok.jpg', mimetype: 'image/jpeg', originalname: 'ok.jpg', size: 100 }
    };
    const res = createRes();
    await tradeController.uploadAttachment(req, res, jest.fn());

    expect(res.statusCode).toBe(201);
    expect(Trade.addAttachment).toHaveBeenCalledTimes(1);
  });
});
