jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/aiCreditService', () => ({ getCost: jest.fn(() => 5), hasCredits: jest.fn(), useCredits: jest.fn() }));
jest.mock('../../src/utils/aiProvider', () => ({ generateResponse: jest.fn() }));
jest.mock('../../src/services/aiImageContext', () => ({ loadImageContext: jest.fn(), describeImageContext: jest.fn(() => 'Image 1: Chart') }));
const db = require('../../src/config/database');
const Credits = require('../../src/services/aiCreditService');
const AIProvider = require('../../src/utils/aiProvider');
const { loadImageContext } = require('../../src/services/aiImageContext');
const Service = require('../../src/services/aiSessionService');
const summary = () => ({ metrics: { trade_count: 3 }, patterns: {}, time_analysis: {}, sample_trades: {} });

beforeEach(() => {
  jest.clearAllMocks();
  Credits.hasCredits.mockResolvedValue({ allowed: true });
  Credits.useCredits.mockResolvedValue({ remaining: 50 });
  AIProvider.generateResponse.mockResolvedValue('Trade analysis');
  db.query.mockImplementation(async sql => ({ rows: sql.includes('INSERT INTO ai_sessions') ? [{ id: 'session-1', max_followups: 5 }] : [] }));
  jest.spyOn(Service, 'getAISettings').mockResolvedValue({ provider: 'openai', ai_analysis_instructions: 'Yellow lines indicate support.' });
  jest.spyOn(Service, 'buildTradeSummary').mockImplementation(async () => summary());
  loadImageContext.mockResolvedValue({ images: [], metadata: { included_images: [], skipped_images: [], included_count: 0, skipped_count: 0 } });
});
afterEach(() => jest.restoreAllMocks());

test('snapshots personal instructions and preserves built-in performance sections', async () => {
  await Service.createSession('user-1');
  const prompt = AIProvider.generateResponse.mock.calls[0][0];
  expect(prompt).toContain('Yellow lines indicate support.');
  expect(prompt).toContain('**RISK MANAGEMENT**');
  const stored = JSON.parse(db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO ai_sessions'))[1][3]);
  expect(stored.ai_analysis_instructions).toBe('Yellow lines indicate support.');
});

test('follow-ups retain original preferences after settings change', async () => {
  const stored = { ...summary(), ai_analysis_instructions: 'Original chart legend' };
  db.query.mockResolvedValue({ rows: [{ id: 'session-1', status: 'active', expires_at: new Date(Date.now() + 3600000), followup_count: 0, max_followups: 5, trade_summary: stored, messages: [] }] });
  await Service.sendFollowup('session-1', 'user-1', 'Explain my entry');
  const prompt = AIProvider.generateResponse.mock.calls.at(-1)[0];
  expect(prompt).toContain('Original chart legend');
  expect(prompt).not.toContain('Yellow lines indicate support.');
});

test('single-trade initial and follow-up calls receive verified screenshots', async () => {
  const trade_summary = { analysis_type: 'single_trade', trade_id: 'trade-1', trade: { symbol: 'AAPL' }, enrichment: {}, visual_context: { images: [] }, executions: [] };
  const images = [{ data: 'aW1hZ2U=', mime_type: 'image/jpeg', file_name: 'Chart', attachment_id: 'image-1' }];
  const metadata = { included_images: [{ attachment_id: 'image-1', file_name: 'Chart' }], skipped_images: [], included_count: 1, skipped_count: 0 };
  loadImageContext.mockResolvedValue({ images, metadata });
  jest.spyOn(Service, 'buildSingleTradeSummary').mockResolvedValue(trade_summary);
  await Service.createSession('user-1', {}, { tradeId: 'trade-1' });
  expect(AIProvider.generateResponse.mock.calls[0][2]).toEqual({ images });
  expect(AIProvider.generateResponse.mock.calls[0][0]).toContain('**Technical Analysis**');
  const stored = JSON.parse(db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO ai_sessions'))[1][3]);
  expect(JSON.stringify(stored)).not.toContain(images[0].data);
  db.query.mockResolvedValue({ rows: [{ status: 'active', expires_at: new Date(Date.now() + 3600000), followup_count: 0, max_followups: 5, trade_summary: stored, messages: [] }] });
  await Service.sendFollowup('session-1', 'user-1', 'Explain the yellow trendline');
  expect(loadImageContext).toHaveBeenLastCalledWith('user-1', 'trade-1', 'openai', metadata.included_images);
  expect(AIProvider.generateResponse.mock.calls.at(-1)[2]).toEqual({ images });
});

test('image rejection happens before session creation or credit deduction', async () => {
  AIProvider.generateResponse.mockRejectedValue(Object.assign(new Error('Image model rejected input'), { code: 'AI_IMAGE_INPUT_REJECTED' }));
  await expect(Service.createSession('user-1')).rejects.toMatchObject({ code: 'AI_IMAGE_INPUT_REJECTED' });
  expect(Credits.useCredits).not.toHaveBeenCalled();
  expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO ai_sessions'))).toBe(false);
});
