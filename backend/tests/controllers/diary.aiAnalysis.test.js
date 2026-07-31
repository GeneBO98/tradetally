jest.mock('../../src/models/Diary', () => ({
  findByDateRange: jest.fn()
}));
jest.mock('../../src/utils/aiService', () => ({
  generateResponse: jest.fn()
}));
jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const Diary = require('../../src/models/Diary');
const aiService = require('../../src/utils/aiService');
const db = require('../../src/config/database');
const diaryController = require('../../src/controllers/diary.controller');

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('diary AI analysis timeout recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('persists a completed analysis under the client request ID', async () => {
    const req = {
      user: { id: 'user-1' },
      query: {
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        request_id: 'journal-request-123'
      }
    };
    const res = createResponse();

    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'analysis-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    Diary.findByDateRange.mockResolvedValue([
      {
        entry_date: '2026-07-15',
        title: 'Good execution',
        content: 'Waited for confirmation.',
        market_bias: 'bullish',
        key_levels: null,
        watchlist: [],
        lessons_learned: 'Stay patient.',
        followed_plan: true,
        tags: []
      }
    ]);
    aiService.generateResponse.mockResolvedValue('Patient execution was the main strength.');

    await diaryController.analyzeEntries(req, res);

    expect(aiService.generateResponse).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Good execution'),
      { maxTokens: 1500, temperature: 0.7 }
    );
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining("SET status = 'completed'"),
      ['user-1', 'journal-request-123', 'Patient execution was the main strength.', 1]
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'journal-request-123',
      status: 'completed',
      analysis: 'Patient execution was the main strength.',
      entriesAnalyzed: 1
    }));
  });

  test('returns a saved result to the polling client', async () => {
    const req = {
      user: { id: 'user-1' },
      params: { requestId: 'journal-request-123' }
    };
    const res = createResponse();
    db.query.mockResolvedValueOnce({
      rows: [{
        request_id: 'journal-request-123',
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        status: 'completed',
        analysis: 'Recovered analysis',
        entries_analyzed: 4,
        error: null,
        created_at: '2026-07-31T12:00:00Z',
        completed_at: '2026-07-31T12:02:00Z'
      }]
    });

    await diaryController.getAnalysisStatus(req, res);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = $1 AND request_id = $2'),
      ['user-1', 'journal-request-123']
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      analysis: 'Recovered analysis',
      entriesAnalyzed: 4
    }));
  });
});
