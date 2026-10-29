jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/aiCreditService', () => ({
  getCost: jest.fn(type => ({ NEW_SESSION: 10, FOLLOWUP: 2, CHAT_MESSAGE: 3 })[type]),
  hasCredits: jest.fn(),
  useCredits: jest.fn()
}));
jest.mock('../../src/utils/aiProvider', () => ({ generateResponse: jest.fn() }));
jest.mock('../../src/services/aiChatContext', () => {
  const actual = jest.requireActual('../../src/services/aiChatContext');
  return {
    MAX_FOCUS_SYMBOLS: actual.MAX_FOCUS_SYMBOLS,
    extractSymbols: actual.extractSymbols.bind(actual),
    getKnownSymbols: jest.fn(),
    buildAccountContext: jest.fn(),
    formatAccountContext: jest.fn(() => 'OPEN POSITIONS (1):\n- NOW: long 10 @ $900.00'),
    buildSymbolContexts: jest.fn(),
    formatSymbolContexts: jest.fn(contexts => contexts.map(c => `SYMBOL FOCUS: ${c.symbol}`).join('\n'))
  };
});

const db = require('../../src/config/database');
const Credits = require('../../src/services/aiCreditService');
const AIProvider = require('../../src/utils/aiProvider');
const AIChatContext = require('../../src/services/aiChatContext');
const Service = require('../../src/services/aiSessionService');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  Credits.hasCredits.mockResolvedValue({ allowed: true });
  Credits.useCredits.mockResolvedValue({ remaining: 40 });
  AIProvider.generateResponse.mockResolvedValue('Chat reply');
  AIChatContext.getKnownSymbols.mockResolvedValue(new Set(['NOW']));
  AIChatContext.buildAccountContext.mockResolvedValue({ all_time: { total_trades: 42 } });
  AIChatContext.buildSymbolContexts.mockImplementation(async (_userId, symbols) => symbols.map(symbol => ({ symbol })));
  jest.spyOn(Service, 'getAISettings').mockResolvedValue({ provider: 'openai', modelName: 'gpt-5', ai_analysis_instructions: '' });
});
afterEach(() => jest.restoreAllMocks());

test('createChatSession answers with journal context and stores a titled chat', async () => {
  db.query.mockImplementation(async sql => ({
    rows: sql.includes('INSERT INTO ai_sessions') ? [{ id: 'chat-1', max_followups: Service.CHAT_MAX_MESSAGES }] : []
  }));

  const result = await Service.createChatSession('user-1', 'NOW just missed EPS. What is the outlook for my position?');

  const prompt = AIProvider.generateResponse.mock.calls[0][0];
  expect(prompt).toContain('OPEN POSITIONS (1)');
  expect(prompt).toContain('SYMBOL FOCUS: NOW');
  expect(prompt).toContain("USER'S MESSAGE:\nNOW just missed EPS");

  const insert = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO ai_sessions'));
  expect(JSON.parse(insert[1][1])).toMatchObject({ analysisType: 'chat' });
  expect(JSON.parse(insert[1][3])).toMatchObject({ analysis_type: 'chat', title: 'NOW just missed EPS. What is the outlook for my position?' });
  expect(insert[1][2]).toBe(42);

  const roles = db.query.mock.calls
    .filter(([sql]) => sql.includes('INSERT INTO ai_messages'))
    .map(([sql]) => sql.match(/'(system|user|assistant)'/)[1]);
  expect(roles).toEqual(['system', 'user', 'assistant']);
  expect(Credits.useCredits).toHaveBeenCalledWith('user-1', 3);
  expect(result).toMatchObject({ session_id: 'chat-1', response: 'Chat reply', credits_remaining: 40 });
});

test('chat follow-ups carry the previous symbol when none is mentioned', async () => {
  db.query.mockResolvedValue({
    rows: [{
      id: 'chat-1', status: 'active', followup_count: 0, max_followups: Service.CHAT_MAX_MESSAGES,
      trade_summary: { analysis_type: 'chat', title: 'NOW outlook' },
      messages: [
        { role: 'system', content: 'start' },
        { role: 'user', content: 'What is the outlook for NOW?' },
        { role: 'assistant', content: 'Mixed.' }
      ]
    }]
  });

  await Service.sendFollowup('chat-1', 'user-1', 'What about guidance?');

  const prompt = AIProvider.generateResponse.mock.calls[0][0];
  expect(prompt).toContain('SYMBOL FOCUS: NOW');
  expect(prompt).toContain('User: What is the outlook for NOW?');
  expect(Credits.useCredits).toHaveBeenCalledWith('user-1', 3);
});

test('expired single-trade analyses reopen with current status and live market context', async () => {
  const trade_summary = { analysis_type: 'single_trade', trade_id: 'trade-1', trade: { symbol: 'NOW', side: 'long' }, enrichment: {}, visual_context: {} };
  db.query.mockImplementation(async sql => {
    if (sql.includes('FROM ai_sessions s')) {
      return {
        rows: [{
          id: 'session-1', status: 'expired', expires_at: new Date(Date.now() - 86400000),
          created_at: new Date('2026-09-02T00:00:00Z'), followup_count: 5, max_followups: 5,
          trade_summary, messages: [{ role: 'assistant', content: 'Original analysis' }]
        }]
      };
    }
    if (sql.includes('FROM trades WHERE id')) {
      return { rows: [{ symbol: 'NOW', side: 'long', quantity: 10, entry_price: '900', exit_price: null }] };
    }
    return { rows: [] };
  });

  const result = await Service.sendFollowup('session-1', 'user-1', 'They just missed EPS. Should I hold?');

  const prompt = AIProvider.generateResponse.mock.calls[0][0];
  expect(prompt).toContain('Current status');
  expect(prompt).toContain('Still open: long 10 @ $900.00');
  expect(prompt).toContain('LIVE MARKET CONTEXT');
  expect(prompt).toContain('SYMBOL FOCUS: NOW');

  const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE ai_sessions'));
  expect(update[0]).toContain("status = 'active'");
  expect(update[1][2]).toBe(Service.MAX_FOLLOWUPS);
  expect(result).toMatchObject({ followup_count: 6, max_followups: Service.MAX_FOLLOWUPS });
  expect(Credits.useCredits).toHaveBeenCalledWith('user-1', 2);
});

test('conversation history keeps the original analysis and the latest turns', () => {
  const messages = [{ role: 'assistant', content: 'Original analysis' }];
  for (let i = 0; i < 20; i++) {
    messages.push({ role: i % 2 ? 'assistant' : 'user', content: `message ${i}` });
  }

  const history = Service.buildConversationHistory(messages);
  expect(history.startsWith('Assistant: Original analysis')).toBe(true);
  expect(history).toContain('earlier messages omitted');
  expect(history).toContain('message 19');
  expect(history).not.toContain('message 0\n');
});
