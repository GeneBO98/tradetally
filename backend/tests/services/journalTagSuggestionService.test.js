jest.mock('../../src/utils/aiProvider', () => ({ generateResponse: jest.fn() }));
const AIProvider = require('../../src/utils/aiProvider');
const service = require('../../src/services/journalTagSuggestionService');

beforeEach(() => jest.clearAllMocks());

test('redacts contact details, URLs, IDs and credentials before sending text', () => {
  const text = service.normalizeText('Write to joe@example.com at https://example.com/?token=abc Bearer secret-token sk-abcdefghijklmnop 123456789012');
  expect(text).not.toMatch(/joe@|example.com|secret-token|abcdefghijklmnop|123456789012/);
  expect(text).toContain('[EMAIL]');
});

test('does not accept invented tags, fabricated evidence or model confidence as accuracy', () => {
  const text = 'I entered just to win my money back.';
  const result = service.normalizeDecisions({
    'revenge-trade': { status: 'present', evidence: text, probability: 0.99 },
    fomo: { status: 'present', evidence: 'invented supporting quote' },
    invented: { status: 'present', evidence: text }
  }, text);
  expect(result.find(d => d.tag === 'revenge-trade')).toMatchObject({ suggested: true, probability: null });
  expect(result.find(d => d.tag === 'fomo')).toMatchObject({ suggested: false, status: 'insufficient_evidence' });
  expect(result).toHaveLength(Object.keys(service.TAGS).length);
});

test('empty notes abstain without calling the AI provider', async () => {
  const result = await service.classify('');
  expect(result.decisions.every(d => d.status === 'insufficient_evidence')).toBe(true);
  expect(AIProvider.generateResponse).not.toHaveBeenCalled();
});

test('lightweight classification uses the same ontology and exact-quote validation', async () => {
  const text = 'I froze and skipped my planned entry because I was afraid.';
  AIProvider.generateResponse.mockResolvedValue(JSON.stringify({ tags: {
    hesitation: { status: 'present', evidence: text }
  } }));
  const result = await service.classify(text, { settings: { modelName: 'test-model' } });
  expect(result.decisions.find(d => d.tag === 'hesitation').suggested).toBe(true);
  expect(result.usage).toBeNull();
  expect(AIProvider.generateResponse.mock.calls[0][2].system).toContain('future intentions');
});

test('malformed provider output fails without creating labels', async () => {
  AIProvider.generateResponse.mockResolvedValue('not JSON');
  await expect(service.classify('A sufficiently long journal note.', { provider: 'lightweight', settings: {} })).rejects.toThrow();
});
