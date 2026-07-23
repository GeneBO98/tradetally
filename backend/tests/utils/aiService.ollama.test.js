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

describe('AIService Ollama provider routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(aiService, 'getUserSettings').mockResolvedValue({
      provider: 'ollama',
      apiKey: '',
      apiUrl: 'http://localhost:11434/v1',
      model: 'qwen2.5:3b-instruct'
    });
    AIProvider.generateResponse.mockResolvedValue('Journal analysis');
  });

  afterEach(() => {
    aiService.getUserSettings.mockRestore();
  });

  test('routes journal analysis through the canonical OpenAI-compatible transport', async () => {
    await expect(aiService.generateResponse('user-1', 'Analyze these journal entries', {
      maxTokens: 1500,
      temperature: 0.7
    })).resolves.toBe('Journal analysis');

    expect(AIProvider.generateResponse).toHaveBeenCalledWith(
      'Analyze these journal entries',
      {
        provider: 'ollama',
        apiKey: '',
        apiUrl: 'http://localhost:11434/v1',
        modelName: 'qwen2.5:3b-instruct'
      },
      { maxTokens: 1500, temperature: 0.7 }
    );
  });
});
