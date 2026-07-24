jest.mock('../../src/utils/urlSecurity', () => ({
  fetchAiProviderUrl: jest.fn()
}));

const { fetchAiProviderUrl } = require('../../src/utils/urlSecurity');
const AIProvider = require('../../src/utils/aiProvider');

describe('Custom OpenAI-compatible provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchAiProviderUrl.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Custom response' } }]
      })
    });
  });

  test.each([
    ['https://provider.example/v1', 'https://provider.example/v1/chat/completions'],
    ['https://provider.example/v1/', 'https://provider.example/v1/chat/completions'],
    ['https://provider.example/v1/chat/completions', 'https://provider.example/v1/chat/completions'],
    ['https://provider.example/v1/chat/completions/', 'https://provider.example/v1/chat/completions']
  ])('normalizes %s to one chat completions path', (input, expected) => {
    expect(AIProvider.buildOpenAIChatCompletionsUrl(input)).toBe(expected);
  });

  test.each([
    ['ollama', 'http://localhost:11434', 'http://localhost:11434/v1/chat/completions'],
    ['ollama', 'http://localhost:11434/', 'http://localhost:11434/v1/chat/completions'],
    ['ollama', 'http://localhost:11434/api/generate', 'http://localhost:11434/v1/chat/completions'],
    ['ollama', 'http://localhost:11434/v1', 'http://localhost:11434/v1/chat/completions'],
    ['lmstudio', 'http://localhost:1234', 'http://localhost:1234/v1/chat/completions']
  ])('normalizes a %s URL from %s', (provider, input, expected) => {
    expect(AIProvider.buildOpenAIChatCompletionsUrl(input, provider)).toBe(expected);
  });

  test('sends a standard chat request without authorization for a keyless endpoint', async () => {
    const result = await AIProvider.generateResponse('Review this trade', {
      provider: 'custom',
      apiKey: '',
      apiUrl: 'https://provider.example/v1',
      modelName: 'local-model'
    }, { maxTokens: 250, temperature: 0.2 });

    expect(result).toBe('Custom response');
    expect(fetchAiProviderUrl).toHaveBeenCalledWith(
      'custom',
      'https://provider.example/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );

    const request = fetchAiProviderUrl.mock.calls[0][2];
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
      model: 'local-model',
      max_tokens: 250,
      temperature: 0.2,
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'Review this trade' })
      ])
    }));
  });

  test('sends a configured API key as a Bearer token', async () => {
    await AIProvider.generateResponse('Review this trade', {
      provider: 'custom',
      apiKey: 'secret-key',
      apiUrl: 'https://provider.example/v1/chat/completions',
      modelName: 'hosted-model'
    });

    const request = fetchAiProviderUrl.mock.calls[0][2];
    expect(request.headers.Authorization).toBe('Bearer secret-key');
  });

  test('uses the Ollama v1 chat completions endpoint for a bare server URL', async () => {
    const result = await AIProvider.generateResponse('Analyze these journal entries', {
      provider: 'ollama',
      apiKey: '',
      apiUrl: 'http://localhost:11434',
      modelName: 'qwen2.5:3b-instruct'
    }, { maxTokens: 1500, temperature: 0.7 });

    expect(result).toBe('Custom response');
    expect(fetchAiProviderUrl).toHaveBeenCalledWith(
      'ollama',
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );

    const request = fetchAiProviderUrl.mock.calls[0][2];
    expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
      model: 'qwen2.5:3b-instruct',
      max_tokens: 1500,
      temperature: 0.7
    }));
  });

  test('requires both URL and model for Custom configuration', () => {
    expect(AIProvider.isConfigured({
      provider: 'custom',
      apiUrl: 'https://provider.example/v1',
      modelName: 'hosted-model'
    })).toBe(true);
    expect(AIProvider.isConfigured({
      provider: 'custom',
      apiUrl: 'https://provider.example/v1',
      modelName: ''
    })).toBe(false);
  });
});
