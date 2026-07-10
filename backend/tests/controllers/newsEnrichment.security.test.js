jest.mock('../../src/services/newsEnrichmentService', () => ({ getStats: jest.fn() }));
jest.mock('../../src/utils/jobQueue', () => ({ addJob: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logImport: jest.fn(), logError: jest.fn() }));

const jobQueue = require('../../src/utils/jobQueue');
const controller = require('../../src/controllers/newsEnrichment.controller');

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

describe('news enrichment tenant authorization', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a non-admin backfill for another user', async () => {
    const req = {
      user: { id: '11111111-1111-4111-8111-111111111111', role: 'user' },
      body: { user_id: '22222222-2222-4222-8222-222222222222' }
    };
    const res = response();

    await controller.startBackfill(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(jobQueue.addJob).not.toHaveBeenCalled();
  });

  test('always scopes ordinary-user jobs to that user', async () => {
    jobQueue.addJob.mockResolvedValue('job-1');
    const req = {
      user: { id: '11111111-1111-4111-8111-111111111111', role: 'user' },
      body: { batch_size: 25, max_trades: 100 }
    };
    const res = response();

    await controller.startBackfill(req, res, jest.fn());

    expect(jobQueue.addJob).toHaveBeenCalledWith('news_backfill', {
      userId: req.user.id,
      batchSize: 25,
      maxTrades: 100
    }, 2);
  });
});
