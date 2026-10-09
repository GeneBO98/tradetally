jest.mock('../../src/services/aiSessionService', () => ({
  createSession: jest.fn()
}));

jest.mock('../../src/services/aiCreditService', () => ({}));

const AISessionService = require('../../src/services/aiSessionService');
const aiController = require('../../src/controllers/ai.controller');

describe('aiController session creation recovery metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes the client request ID through to the session service', async () => {
    AISessionService.createSession.mockResolvedValue({
      session_id: 'session-1',
      request_id: 'request-1',
      initial_analysis: 'Analysis'
    });
    const req = {
      user: { id: 'user-1' },
      body: {
        filters: { symbol: 'AAPL' },
        request_id: 'request-1'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    const next = jest.fn();

    await aiController.createSession(req, res, next);

    expect(AISessionService.createSession).toHaveBeenCalledWith(
      'user-1',
      { symbol: 'AAPL' },
      expect.objectContaining({ request_id: 'request-1' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });
});
