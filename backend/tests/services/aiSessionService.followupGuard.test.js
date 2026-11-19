jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/services/aiCreditService', () => ({
  getCost: jest.fn((type) => (type === 'FOLLOWUP' ? 2 : 5)),
  hasCredits: jest.fn(),
  useCredits: jest.fn()
}));

jest.mock('../../src/utils/aiProvider', () => ({
  generateResponse: jest.fn()
}));

jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn()
}));

jest.mock('../../src/services/adminSettings', () => ({
  getDefaultAISettings: jest.fn()
}));

jest.mock('../../src/utils/urlSecurity', () => ({
  validateAiProviderUrl: jest.fn(async (_provider, value) => new URL(value))
}));

const db = require('../../src/config/database');
const AICreditService = require('../../src/services/aiCreditService');
const AIProvider = require('../../src/utils/aiProvider');
const User = require('../../src/models/User');
const adminSettingsService = require('../../src/services/adminSettings');
const AISessionService = require('../../src/services/aiSessionService');

function buildActiveSession(overrides = {}) {
  return {
    id: 'session-1',
    user_id: 'user-1',
    status: 'active',
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    followup_count: 0,
    max_followups: 5,
    messages: [],
    trade_summary: {
      metrics: {
        total_pnl: '120.00',
        win_rate: '55.00',
        trade_count: 12,
        profit_factor: '1.40'
      }
    },
    ...overrides
  };
}

describe('AISessionService follow-up topic guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    AICreditService.hasCredits.mockResolvedValue({ allowed: true });
    AICreditService.useCredits.mockResolvedValue({ remaining: 8 });
    adminSettingsService.getDefaultAISettings.mockResolvedValue({
      provider: 'openai',
      apiKey: 'sk-admin',
      apiUrl: '',
      model: 'gpt-5',
      classifier: {
        enabled: true,
        provider: 'openai',
        apiKey: 'sk-admin',
        apiUrl: '',
        model: 'gpt-4o-mini'
      }
    });
    User.getSettings.mockResolvedValue({
      ai_provider: 'openai',
      ai_api_key: 'sk-test',
      ai_model: 'gpt-5'
    });
  });

  afterEach(() => {
    console.log.mockRestore();
    console.warn.mockRestore();
  });

  test('rejects unrelated follow-ups before calling the main model or deducting credits', async () => {
    db.query.mockResolvedValueOnce({ rows: [buildActiveSession()] });
    AIProvider.generateResponse.mockResolvedValueOnce('{"allowed":false,"reason":"not about trading"}');

    await expect(
      AISessionService.sendFollowup('session-1', 'user-1', 'Write me a pasta recipe')
    ).rejects.toMatchObject({
      code: 'AI_FOLLOWUP_NOT_TRADING_RELATED'
    });

    expect(AIProvider.generateResponse).toHaveBeenCalledTimes(1);
    expect(AIProvider.generateResponse).toHaveBeenCalledWith(
      expect.stringContaining('strict classifier'),
      expect.objectContaining({
        provider: 'openai',
        apiKey: 'sk-admin',
        modelName: 'gpt-4o-mini'
      }),
      expect.objectContaining({
        maxTokens: 120,
        temperature: 0
      })
    );
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(AICreditService.useCredits).not.toHaveBeenCalled();
  });

  test('loads a keyless Custom provider and lets its classifier inherit URL and model', async () => {
    adminSettingsService.getDefaultAISettings.mockResolvedValue({
      provider: '',
      apiKey: '',
      apiUrl: '',
      model: '',
      classifier: {
        enabled: true,
        provider: 'custom',
        apiKey: '',
        apiUrl: '',
        model: ''
      }
    });
    User.getSettings.mockResolvedValue({
      ai_provider: 'custom',
      ai_api_key: '',
      ai_api_url: 'https://provider.example/v1',
      ai_model: 'hosted-model'
    });

    const settings = await AISessionService.getAISettings('user-1');

    expect(settings).toEqual(expect.objectContaining({
      provider: 'custom',
      apiKey: '',
      apiUrl: 'https://provider.example/v1',
      modelName: 'hosted-model',
      classifier: expect.objectContaining({
        enabled: true,
        provider: 'custom',
        apiUrl: 'https://provider.example/v1',
        modelName: 'hosted-model'
      })
    }));
  });

  test('allows trading follow-ups and then calls the configured analysis model', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [buildActiveSession()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    AIProvider.generateResponse
      .mockResolvedValueOnce('{"allowed":true,"reason":"asks about stop placement"}')
      .mockResolvedValueOnce('Your stop was too tight for the setup.');

    const result = await AISessionService.sendFollowup(
      'session-1',
      'user-1',
      'Was my stop too tight on this trade?'
    );

    expect(result.response).toBe('Your stop was too tight for the setup.');
    expect(AIProvider.generateResponse).toHaveBeenCalledTimes(2);
    expect(AIProvider.generateResponse).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("USER'S FOLLOW-UP QUESTION"),
      expect.objectContaining({
        provider: 'openai',
        modelName: 'gpt-5'
      }),
      expect.objectContaining({ system: expect.stringContaining('[[OFF_TOPIC]]') })
    );
    // The user configured their own OpenAI key, so no credits are charged.
    expect(AICreditService.useCredits).not.toHaveBeenCalled();
    expect(AICreditService.hasCredits).toHaveBeenCalledWith('user-1', 0);
    expect(result.credits_used).toBe(0);
  });

  test('charges credits when the request runs on the instance AI key', async () => {
    User.getSettings.mockResolvedValue({});
    db.query
      .mockResolvedValueOnce({ rows: [buildActiveSession()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    AIProvider.generateResponse
      .mockResolvedValueOnce('{"allowed":true,"reason":"asks about stop placement"}')
      .mockResolvedValueOnce('Your stop was too tight for the setup.');

    const result = await AISessionService.sendFollowup('session-1', 'user-1', 'Was my stop too tight on this trade?');

    expect(AICreditService.useCredits).toHaveBeenCalledWith('user-1', 2);
    expect(result.credits_used).toBe(2);
  });

  test('does not call the checker model when admin has not enabled it', async () => {
    adminSettingsService.getDefaultAISettings.mockResolvedValueOnce({
      provider: 'openai',
      apiKey: 'sk-admin',
      apiUrl: '',
      model: 'gpt-5',
      classifier: {
        enabled: false,
        provider: '',
        apiKey: '',
        apiUrl: '',
        model: ''
      }
    });

    db.query
      .mockResolvedValueOnce({ rows: [buildActiveSession()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    AIProvider.generateResponse.mockResolvedValueOnce('Main model response.');

    const result = await AISessionService.sendFollowup(
      'session-1',
      'user-1',
      'Can you explain my profit factor?'
    );

    expect(result.response).toBe('Main model response.');
    expect(AIProvider.generateResponse).toHaveBeenCalledTimes(1);
    // The main model still gets the scope rule, so the gate holds without a checker.
    expect(AIProvider.generateResponse).toHaveBeenCalledWith(
      expect.stringContaining("USER'S FOLLOW-UP QUESTION"),
      expect.objectContaining({
        provider: 'openai',
        modelName: 'gpt-5'
      }),
      expect.objectContaining({ system: expect.stringContaining('[[OFF_TOPIC]]') })
    );
  });

  const disabledClassifier = () => adminSettingsService.getDefaultAISettings.mockResolvedValueOnce({
    provider: 'openai', apiKey: 'sk-admin', apiUrl: '', model: 'gpt-5',
    classifier: { enabled: false, provider: '', apiKey: '', apiUrl: '', model: '' }
  });

  test('the main model gate rejects an off-topic follow-up without storing or charging', async () => {
    disabledClassifier();
    User.getSettings.mockResolvedValue({});
    db.query.mockResolvedValueOnce({ rows: [buildActiveSession()] });
    AIProvider.generateResponse.mockResolvedValueOnce('[[OFF_TOPIC]]');

    await expect(AISessionService.sendFollowup('session-1', 'user-1', 'Tell me about giraffes'))
      .rejects.toMatchObject({ code: 'AI_FOLLOWUP_NOT_TRADING_RELATED' });

    const writes = db.query.mock.calls.filter(([sql]) => /INSERT INTO ai_messages|UPDATE ai_sessions/.test(sql));
    expect(writes).toHaveLength(0);
    expect(AICreditService.useCredits).not.toHaveBeenCalled();
  });

  test('the main model gate also covers single-trade follow-ups', async () => {
    disabledClassifier();
    User.getSettings.mockResolvedValue({});
    db.query.mockImplementation(async sql => (sql.includes('FROM ai_sessions s')
      ? { rows: [buildActiveSession({ trade_summary: { analysis_type: 'single_trade', trade_id: 'trade-1', trade: { symbol: 'NOW', side: 'long' } } })] }
      : { rows: [] }));
    AIProvider.generateResponse.mockResolvedValueOnce('  [[OFF_TOPIC]]\n');

    await expect(AISessionService.sendFollowup('session-1', 'user-1', 'Write me a poem about giraffes'))
      .rejects.toMatchObject({ code: 'AI_FOLLOWUP_NOT_TRADING_RELATED' });
    expect(db.query.mock.calls.some(([sql]) => /INSERT INTO ai_messages/.test(sql))).toBe(false);
    expect(AICreditService.useCredits).not.toHaveBeenCalled();
    db.query.mockReset();
  });

  test('a failing or unreadable pre-filter falls through to the main model', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [buildActiveSession()] })
      .mockResolvedValue({ rows: [] });
    AIProvider.generateResponse.mockImplementation(async prompt => {
      if (prompt.startsWith('You are a strict classifier')) throw new Error('classifier model not found');
      if (prompt.includes("USER'S FOLLOW-UP QUESTION")) return 'Profit factor is gross wins over gross losses.';
      return '';
    });

    const result = await AISessionService.sendFollowup('session-1', 'user-1', 'Can you explain my profit factor?');
    expect(result.response).toBe('Profit factor is gross wins over gross losses.');

    expect(AISessionService.parseClassifierResponse('')).toMatchObject({ allowed: null });
    expect(AISessionService.parseClassifierResponse('{"allowed":false,"reason":"recipe"}')).toMatchObject({ allowed: false });
    db.query.mockReset();
    AIProvider.generateResponse.mockReset();
  });

  test('the pre-filter sees the previous user turn so terse follow-ups keep their context', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [buildActiveSession({ messages: [
        { role: 'system', content: 'start' },
        { role: 'user', content: 'Show my losing trades last month' },
        { role: 'assistant', content: 'Here they are.' }
      ] })] })
      .mockResolvedValue({ rows: [] });
    AIProvider.generateResponse
      .mockResolvedValueOnce('{"allowed":true,"reason":"follow-up"}')
      .mockResolvedValueOnce('Answer.');

    await AISessionService.sendFollowup('session-1', 'user-1', 'and the shorts?');
    const classifierPrompt = AIProvider.generateResponse.mock.calls[0][0];
    expect(classifierPrompt).toContain('Show my losing trades last month');
    expect(classifierPrompt).toMatch(/User message:\nand the shorts\?$/);
    db.query.mockReset();
  });
});
