jest.mock('../../src/services/aiSessionService', () => ({
  deleteTradeAnalysis: jest.fn(),
  deleteTradeAnalyses: jest.fn()
}));

jest.mock('../../src/services/aiCreditService', () => ({}));

const AISessionService = require('../../src/services/aiSessionService');
const aiController = require('../../src/controllers/ai.controller');

function createRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
}

describe('aiController stored trade analysis deletion', () => {
  const req = {
    user: { id: 'user-1' },
    params: { tradeId: 'trade-1', analysisId: 'analysis-1' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('deletes one stored trade analysis', async () => {
    AISessionService.deleteTradeAnalysis.mockResolvedValue(1);
    const res = createRes();
    const next = jest.fn();

    await aiController.deleteTradeAnalysis(req, res, next);

    expect(AISessionService.deleteTradeAnalysis).toHaveBeenCalledWith('user-1', 'trade-1', 'analysis-1');
    expect(res.json).toHaveBeenCalledWith({ success: true, deleted_count: 1 });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 404 for missing or unauthorized analysis', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    AISessionService.deleteTradeAnalysis.mockRejectedValue(new Error('Analysis not found or access denied'));
    const res = createRes();

    await aiController.deleteTradeAnalysis(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Analysis not found',
      message: 'Analysis not found or access denied'
    });
  });

  test('clears all stored trade analyses', async () => {
    AISessionService.deleteTradeAnalyses.mockResolvedValue(3);
    const res = createRes();
    const next = jest.fn();

    await aiController.deleteTradeAnalyses(req, res, next);

    expect(AISessionService.deleteTradeAnalyses).toHaveBeenCalledWith('user-1', 'trade-1');
    expect(res.json).toHaveBeenCalledWith({ success: true, deleted_count: 3 });
    expect(next).not.toHaveBeenCalled();
  });
});
