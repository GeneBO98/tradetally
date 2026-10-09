jest.mock('../../src/models/User', () => ({ getSettings: jest.fn() }));
jest.mock('../../src/services/adminSettings', () => ({
  getDefaultAISettings: jest.fn(),
  getDefaultCusipAISettings: jest.fn()
}));
jest.mock('../../src/utils/urlSecurity', () => ({
  validateAiProviderUrl: jest.fn(),
  fetchAiProviderUrl: jest.fn()
}));
jest.mock('../../src/utils/aiProvider', () => ({
  generateResponse: jest.fn()
}));

const AIProvider = require('../../src/utils/aiProvider');
const aiService = require('../../src/utils/aiService');

describe('AIService Custom provider routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(aiService, 'getUserSettings').mockResolvedValue({
      provider: 'custom',
      apiKey: '',
      apiUrl: 'https://provider.example/v1',
      model: 'hosted-model'
    });
    AIProvider.generateResponse.mockResolvedValue('Custom response');
  });

  afterEach(() => {
    aiService.getUserSettings.mockRestore();
  });

  test('routes general AI generation through the canonical OpenAI-compatible transport', async () => {
    await expect(aiService.generateResponse('user-1', 'Review this trade', {
      maxTokens: 300
    })).resolves.toBe('Custom response');

    expect(AIProvider.generateResponse).toHaveBeenCalledWith(
      'Review this trade',
      {
        provider: 'custom',
        apiKey: '',
        apiUrl: 'https://provider.example/v1',
        modelName: 'hosted-model'
      },
      { maxTokens: 300 }
    );
  });
});
