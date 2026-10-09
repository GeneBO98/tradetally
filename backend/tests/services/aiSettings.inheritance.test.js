jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/User', () => ({ getSettings: jest.fn() }));
jest.mock('../../src/services/adminSettings', () => ({
  getDefaultAISettings: jest.fn(), getDefaultCusipAISettings: jest.fn()
}));
jest.mock('../../src/utils/aiProvider', () => ({ generateResponse: jest.fn() }));
jest.mock('../../src/utils/urlSecurity', () => ({
  validateAiProviderUrl: jest.fn(async (_provider, value) => new URL(value))
}));

const User = require('../../src/models/User');
const admin = require('../../src/services/adminSettings');
const sessions = require('../../src/services/aiSessionService');
const aiService = require('../../src/utils/aiService');
const { coalesceSettingsBundle } = require('../../src/utils/aiSettings');

const defaults = { provider: 'openai', apiKey: 'admin-key', apiUrl: '', model: 'configured-model' };

describe('AI settings inheritance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    admin.getDefaultAISettings.mockResolvedValue(defaults);
    admin.getDefaultCusipAISettings.mockResolvedValue({});
  });

  test.each([
    { ai_provider: 'gemini', ai_api_key: null, ai_api_url: null, ai_model: null },
    { ai_provider: 'gemini', ai_api_key: '  ', ai_model: '' },
    { ai_provider: null },
    null
  ])('legacy and unconfigured users inherit the complete instance bundle: %j', async (row) => {
    User.getSettings.mockResolvedValue(row);
    await expect(aiService.getUserSettings('user-1')).resolves.toEqual(defaults);
    await expect(aiService.getCusipUserSettings('user-1')).resolves.toEqual(defaults);
    await expect(sessions.getAISettings('user-1')).resolves.toMatchObject({
      provider: 'openai', apiKey: 'admin-key', modelName: 'configured-model'
    });
  });

  test('preserves explicitly configured Gemini credentials without borrowing OpenAI settings', async () => {
    User.getSettings.mockResolvedValue({ ai_provider: 'gemini', ai_api_key: 'user-key', ai_model: 'user-model' });
    await expect(aiService.getUserSettings('user-1')).resolves.toEqual({
      provider: 'gemini', apiKey: 'user-key', apiUrl: '', model: 'user-model'
    });
    await expect(sessions.getAISettings('user-1')).resolves.toMatchObject({
      provider: 'gemini', apiKey: 'user-key', modelName: 'user-model'
    });
  });

  test('preserves a keyless custom provider', async () => {
    User.getSettings.mockResolvedValue({ ai_provider: 'custom', ai_api_url: 'https://example.com/v1', ai_model: 'custom-model' });
    await expect(sessions.getAISettings('user-1')).resolves.toMatchObject({
      provider: 'custom', apiKey: '', apiUrl: 'https://example.com/v1', modelName: 'custom-model'
    });
  });

  test('does not invent a Gemini provider when instance settings are absent', async () => {
    admin.getDefaultAISettings.mockResolvedValue({});
    User.getSettings.mockResolvedValue({ ai_provider: 'gemini' });
    await expect(sessions.getAISettings('user-1')).rejects.toThrow('No AI provider configured');
  });

  test('provider overrides cannot borrow another provider credentials or model', async () => {
    User.getSettings.mockResolvedValue({ ai_provider: 'openai', ai_api_key: 'user-openai-key', ai_model: 'openai-model' });
    await expect(sessions.getAISettings('user-1', { provider: 'claude' })).rejects.toThrow('No API key configured for claude');
    expect(coalesceSettingsBundle({ provider: 'claude' }, defaults)).toEqual({
      provider: 'claude', apiKey: '', apiUrl: '', model: ''
    });
  });
});
