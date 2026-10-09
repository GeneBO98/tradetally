jest.mock('node-fetch', () => jest.fn());

const fetch = require('node-fetch');
const { resolveGeminiModel, clearGeminiModelCache, FALLBACK_MODEL } = require('../../src/utils/geminiModels');

const MODELS = [
  { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.6-flash-preview-09-2026', displayName: 'Gemini 3.6 Flash Preview', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.6-pro', displayName: 'Gemini 3.6 Pro', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/text-embedding-004', displayName: 'Text Embedding', supportedGenerationMethods: ['embedContent'] }
];

function serve(models = MODELS) {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ models }) });
}

describe('resolveGeminiModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGeminiModelCache();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('keeps a valid model ID, with or without the models/ prefix', async () => {
    serve();
    await expect(resolveGeminiModel('key', 'gemini-3.6-pro')).resolves.toBe('gemini-3.6-pro');
    await expect(resolveGeminiModel('key', 'models/gemini-2.5-flash')).resolves.toBe('gemini-2.5-flash');
  });

  it('maps a display name typed in any word order to its stable ID', async () => {
    serve();
    await expect(resolveGeminiModel('key', 'Gemini Flash 3.6')).resolves.toBe('gemini-3.6-flash');
    await expect(resolveGeminiModel('key', 'Gemini 3.6 Pro')).resolves.toBe('gemini-3.6-pro');
  });

  it('falls back to the newest stable Flash for retired, empty or autofilled values', async () => {
    serve();
    await expect(resolveGeminiModel('key', 'gemini-1.5-flash')).resolves.toBe('gemini-3.6-flash');
    await expect(resolveGeminiModel('key', '')).resolves.toBe('gemini-3.6-flash');
    await expect(resolveGeminiModel('key', 'someone@example.com')).resolves.toBe('gemini-3.6-flash');
    expect(console.warn.mock.calls.flat().join(' ')).not.toContain('example.com');
  });

  it('sends the key in a header, not the URL, and caches the list per key', async () => {
    serve();
    await resolveGeminiModel('secret-key', 'gemini-3.6-pro');
    await resolveGeminiModel('secret-key', 'gemini-2.5-flash');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).not.toContain('secret-key');
    expect(fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('secret-key');
  });

  it('never throws when the model list is unavailable', async () => {
    fetch.mockRejectedValue(new Error('network down'));
    await expect(resolveGeminiModel('key', 'gemini-3.6-pro')).resolves.toBe('gemini-3.6-pro');
    await expect(resolveGeminiModel('key', 'Gemini Flash 3.6')).resolves.toBe(FALLBACK_MODEL);
  });
});
