jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() }
}));

jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({}));

jest.mock('../../src/services/adminSettings', () => ({
  updateDefaultAISettings: jest.fn(),
  updateDefaultCusipAISettings: jest.fn()
}));

jest.mock('../../src/utils/urlSecurity', () => ({
  validateAiProviderUrl: jest.fn()
}));

jest.mock('../../src/services/brokerSync/encryptionService', () => ({
  isEncrypted: jest.fn(() => false),
  encrypt: jest.fn(value => value)
}));

jest.mock('../../src/services/pnlEngine', () => ({ computeTradePnl: jest.fn() }));
jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn() }));
jest.mock('../../src/services/settingsCache', () => ({ invalidate: jest.fn() }));
jest.mock('../../src/services/optionStrategyGroupingService', () => ({}));

const User = require('../../src/models/User');
const adminSettingsService = require('../../src/services/adminSettings');
const { validateAiProviderUrl } = require('../../src/utils/urlSecurity');
const settingsController = require('../../src/controllers/settings.controller');

function createResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('Custom AI provider settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateAiProviderUrl.mockResolvedValue(new URL('https://provider.example/v1'));
    adminSettingsService.updateDefaultAISettings.mockResolvedValue(true);
    adminSettingsService.updateDefaultCusipAISettings.mockResolvedValue(true);
  });

  test('saves user Custom settings without requiring an API key', async () => {
    User.updateSettings.mockResolvedValue({
      ai_provider: 'custom',
      ai_api_key: null,
      ai_api_url: 'https://provider.example/v1',
      ai_model: 'hosted-model'
    });
    const req = {
      user: { id: 'user-1' },
      body: {
        aiProvider: 'custom',
        aiApiKey: '',
        aiApiUrl: 'https://provider.example/v1',
        aiModel: 'hosted-model'
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await settingsController.updateAIProviderSettings(req, res, next);

    expect(validateAiProviderUrl).toHaveBeenCalledWith('custom', 'https://provider.example/v1');
    expect(User.updateSettings).toHaveBeenCalledWith('user-1', expect.objectContaining({
      ai_provider: 'custom',
      ai_api_url: 'https://provider.example/v1',
      ai_model: 'hosted-model',
      ai_api_key: ''
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ aiProvider: 'custom' }));
    expect(next).not.toHaveBeenCalled();
  });

  test.each([
    [{ aiApiUrl: '', aiModel: 'hosted-model' }, 'API URL is required for custom'],
    [{ aiApiUrl: 'https://provider.example/v1', aiModel: '' }, 'Model is required for custom']
  ])('rejects incomplete user Custom settings', async (overrides, message) => {
    const req = {
      user: { id: 'user-1' },
      body: {
        aiProvider: 'custom',
        aiApiKey: '',
        aiApiUrl: 'https://provider.example/v1',
        aiModel: 'hosted-model',
        ...overrides
      }
    };
    const res = createResponse();

    await settingsController.updateAIProviderSettings(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: message });
    expect(User.updateSettings).not.toHaveBeenCalled();
  });

  test('saves Custom CUSIP settings without an API key', async () => {
    User.updateSettings.mockResolvedValue({
      cusip_ai_provider: 'custom',
      cusip_ai_api_key: null,
      cusip_ai_api_url: 'https://provider.example/v1',
      cusip_ai_model: 'cusip-model'
    });
    const req = {
      user: { id: 'user-1' },
      body: {
        cusipAiProvider: 'custom',
        cusipAiApiKey: '',
        cusipAiApiUrl: 'https://provider.example/v1',
        cusipAiModel: 'cusip-model',
        useMainProvider: false
      }
    };
    const res = createResponse();

    await settingsController.updateCusipAIProviderSettings(req, res, jest.fn());

    expect(User.updateSettings).toHaveBeenCalledWith('user-1', expect.objectContaining({
      cusip_ai_provider: 'custom',
      cusip_ai_model: 'cusip-model'
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cusipAiProvider: 'custom' }));
  });

  test('accepts Custom admin defaults and a Custom classifier without API keys', async () => {
    const req = {
      user: { role: 'admin' },
      body: {
        aiProvider: 'custom',
        aiApiKey: '',
        aiApiUrl: 'https://provider.example/v1',
        aiModel: 'work-model',
        aiClassifierEnabled: true,
        aiClassifierProvider: 'custom',
        aiClassifierApiKey: '',
        aiClassifierApiUrl: 'https://classifier.example/v1',
        aiClassifierModel: 'checking-model'
      }
    };
    const res = createResponse();

    await settingsController.updateAdminAISettings(req, res, jest.fn());

    expect(adminSettingsService.updateDefaultAISettings).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'custom',
      apiUrl: 'https://provider.example/v1',
      model: 'work-model',
      classifierProvider: 'custom',
      classifierApiUrl: 'https://classifier.example/v1',
      classifierModel: 'checking-model'
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ aiProvider: 'custom' }));
  });

  test('saves Custom admin CUSIP defaults without an API key', async () => {
    const req = {
      user: { role: 'admin' },
      body: {
        cusipAiProvider: 'custom',
        cusipAiApiKey: '',
        cusipAiApiUrl: 'https://provider.example/v1',
        cusipAiModel: 'cusip-model',
        useMainProvider: false
      }
    };
    const res = createResponse();

    await settingsController.updateAdminCusipAISettings(req, res, jest.fn());

    expect(adminSettingsService.updateDefaultCusipAISettings).toHaveBeenCalledWith({
      provider: 'custom',
      apiKey: '',
      apiUrl: 'https://provider.example/v1',
      model: 'cusip-model'
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cusipAiProvider: 'custom' }));
  });
});
