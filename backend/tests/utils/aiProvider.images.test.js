jest.mock('../../src/utils/urlSecurity', () => ({ fetchAiProviderUrl: jest.fn() }));
jest.mock('../../src/utils/geminiModels', () => ({ resolveGeminiModel: jest.fn(async (_key, model) => model) }));
const mockGenerateContent = jest.fn();
jest.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel: () => ({ generateContent: mockGenerateContent }) })) }));
const { fetchAiProviderUrl } = require('../../src/utils/urlSecurity');
const AIProvider = require('../../src/utils/aiProvider');
const images = [{ data: 'aW1hZ2U=', mime_type: 'image/jpeg', file_name: 'Chart.jpg' }];

describe('AI provider screenshot inputs', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    jest.clearAllMocks();
    fetchAiProviderUrl.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'Analysis' } }] }) });
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'Analysis' }] }) }));
    mockGenerateContent.mockResolvedValue({ response: { text: () => 'Analysis' } });
  });
  afterAll(() => { global.fetch = originalFetch; });
  test('OpenAI sends labelled base64 images with high detail', async () => {
    await AIProvider.generateResponse('Review this trade', { provider: 'openai', apiKey: 'test-key', modelName: 'gpt-4o-mini' }, { images });
    const body = JSON.parse(fetchAiProviderUrl.mock.calls[0][2].body);
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: 'Review this trade' }, { type: 'text', text: 'Image 1: Chart.jpg' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aW1hZ2U=', detail: 'high' } }
    ]);
  });
  test('Claude uses image source blocks', async () => {
    await AIProvider.generateResponse('Review', { provider: 'claude', apiKey: 'test-key', modelName: 'claude-model' }, { images });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages[0].content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'aW1hZ2U=' } });
  });
  test('Gemini supplies inline image parts', async () => {
    await AIProvider.generateResponse('Review', { provider: 'gemini', apiKey: 'test-key', modelName: 'gemini-model' }, { images });
    expect(mockGenerateContent.mock.calls[0][0].contents[0].parts).toContainEqual({ inlineData: { mimeType: 'image/jpeg', data: 'aW1hZ2U=' } });
  });
  test('text-only requests retain string content', async () => {
    await AIProvider.generateResponse('Review', { provider: 'openai', apiKey: 'test-key' });
    expect(JSON.parse(fetchAiProviderUrl.mock.calls[0][2].body).messages[1].content).toBe('Review');
  });
  test('image-model rejection returns an actionable error without a text retry', async () => {
    fetchAiProviderUrl.mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'This model does not support image inputs' } }) });
    await expect(AIProvider.generateResponse('Review', { provider: 'openai', apiKey: 'test-key' }, { images })).rejects.toMatchObject({ code: 'AI_IMAGE_INPUT_REJECTED', status: 400 });
    expect(fetchAiProviderUrl).toHaveBeenCalledTimes(1);
  });
  test('unsupported provider cannot silently discard image input', async () => {
    await expect(AIProvider.generateResponse('Review', { provider: 'custom' }, { images })).rejects.toThrow('unavailable');
    expect(fetchAiProviderUrl).not.toHaveBeenCalled();
  });
});
