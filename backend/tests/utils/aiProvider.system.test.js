jest.mock('../../src/utils/urlSecurity', () => ({
  fetchAiProviderUrl: jest.fn()
}));
jest.mock('../../src/utils/aiCliProvider', () => ({
  generateResponse: jest.fn()
}));
jest.mock('../../src/utils/geminiModels', () => ({
  resolveGeminiModel: jest.fn(async () => 'gemini-test')
}));
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({ generateContent: mockGenerateContent }));
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel: mockGetGenerativeModel }))
}));

const { fetchAiProviderUrl } = require('../../src/utils/urlSecurity');
const AICliProvider = require('../../src/utils/aiCliProvider');
const AIProvider = require('../../src/utils/aiProvider');

const okJson = body => ({ ok: true, json: async () => body });

describe('AIProvider system message option', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test('OpenAI-compatible providers send it as the system message', async () => {
    fetchAiProviderUrl.mockResolvedValueOnce(okJson({ choices: [{ message: { content: 'hi' } }] }));
    await AIProvider.generateResponse('DATA', { provider: 'openai', apiKey: 'k', modelName: 'gpt-4o-mini' }, { system: 'RULES' });
    const body = JSON.parse(fetchAiProviderUrl.mock.calls[0][2].body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'RULES' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'DATA' });
  });

  test('OpenAI-compatible providers keep the default system message without it', async () => {
    fetchAiProviderUrl.mockResolvedValueOnce(okJson({ choices: [{ message: { content: 'hi' } }] }));
    await AIProvider.generateResponse('DATA', { provider: 'ollama', apiUrl: 'http://localhost:11434', modelName: 'llama' });
    const body = JSON.parse(fetchAiProviderUrl.mock.calls[0][2].body);
    expect(body.messages[0].content).toMatch(/professional trading performance analyst/);
  });

  test('Claude sends it in the top-level system field', async () => {
    global.fetch.mockResolvedValueOnce(okJson({ content: [{ text: 'hi' }] }));
    await AIProvider.generateResponse('DATA', { provider: 'claude', apiKey: 'k', modelName: 'claude-x' }, { system: 'RULES' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.system).toBe('RULES');
    expect(body.messages).toEqual([{ role: 'user', content: 'DATA' }]);
  });

  test('Gemini passes it as systemInstruction', async () => {
    mockGenerateContent.mockResolvedValueOnce({ response: { text: () => 'hi' } });
    await AIProvider.generateResponse('DATA', { provider: 'gemini', apiKey: 'k', modelName: 'gemini-x' }, { system: 'RULES' });
    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-test', systemInstruction: 'RULES' });
    const call = mockGenerateContent.mock.calls[0][0];
    expect(call.contents[0].parts[0].text).toBe('DATA');
  });

  test('CLI providers get the system text prepended to the prompt', async () => {
    AICliProvider.generateResponse.mockResolvedValueOnce('hi');
    await AIProvider.generateResponse('DATA', { provider: 'claude_cli', modelName: 'x' }, { system: 'RULES' });
    expect(AICliProvider.generateResponse).toHaveBeenCalledWith('RULES\n\nDATA', { provider: 'claude_cli', modelName: 'x' });
  });
});
