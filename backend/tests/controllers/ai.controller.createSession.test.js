jest.mock('../../src/services/aiSessionService', () => ({
  createSession: jest.fn(),
  sendFollowup: jest.fn()
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


describe.each(['createSession', 'sendFollowup'])('%s public errors', (method) => {
  test.each([
    'Gemini API key not configured',
    'No API key configured for gemini. Please configure it in Settings > AI Provider.',
    'OpenAI model not found: internal-model',
    'Gemini API key expired',
    'Provider authentication failed: secret-detail'
  ])('hides provider diagnostics: %s', async (message) => {
    AISessionService[method].mockRejectedValue(new Error(message));
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();
    await aiController[method]({ user: { id: 'user-1' }, params: { id: 'session-1' }, body: { message: 'Review my trades' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'AI_UNAVAILABLE',
      error: 'AI analysis temporarily unavailable',
      message: 'AI analysis is temporarily unavailable. Please try again shortly.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('preserves the actionable insufficient credits response', async () => {
    AISessionService[method].mockRejectedValue(new Error('Insufficient credits to start AI session'));
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await aiController[method]({ user: { id: 'user-1' }, params: { id: 'session-1' }, body: { message: 'Review my trades' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(402);
  });
});
