jest.mock('../../src/utils/aiCliProvider', () => ({
  generateResponse: jest.fn()
}));

const AICliProvider = require('../../src/utils/aiCliProvider');
const AIProvider = require('../../src/utils/aiProvider');

describe('AIProvider CLI routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each(['codex_cli', 'claude_cli'])('routes %s without an API key', async provider => {
    AICliProvider.generateResponse.mockResolvedValue('CLI analysis');

    await expect(AIProvider.generateResponse('Analyze', {
      provider,
      modelName: 'configured-model'
    })).resolves.toBe('CLI analysis');

    expect(AICliProvider.generateResponse).toHaveBeenCalledWith('Analyze', {
      provider,
      modelName: 'configured-model'
    });
    expect(AIProvider.isConfigured({ provider })).toBe(true);
  });
});
