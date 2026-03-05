const { createWebhookSecret, validateEventTypes } = require('../../src/services/webhookService');

describe('webhook service validation helpers', () => {
  test('createWebhookSecret returns expected prefix', () => {
    const secret = createWebhookSecret();
    expect(secret.startsWith('whsec_')).toBe(true);
    expect(secret.length).toBeGreaterThan(20);
  });

  test('validateEventTypes accepts supported event types', () => {
    const result = validateEventTypes(['trade.created', 'trade.updated']);
    expect(result.valid).toBe(true);
    expect(result.invalid).toEqual([]);
  });

  test('validateEventTypes rejects unsupported event types', () => {
    const result = validateEventTypes(['trade.created', 'unsupported.event']);
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual(['unsupported.event']);
  });
});
