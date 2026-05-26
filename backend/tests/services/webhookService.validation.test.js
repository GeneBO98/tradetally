const {
  buildWebhookRequestBody,
  createWebhookSecret,
  formatDiscordPayload,
  formatSlackPayload,
  validateEventTypes,
  validateProviderType
} = require('../../src/services/webhookService');

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

  test('validateProviderType accepts supported provider types', () => {
    expect(validateProviderType('slack')).toBe('slack');
    expect(validateProviderType('DISCORD')).toBe('discord');
    expect(validateProviderType()).toBe('custom');
  });

  test('validateProviderType rejects unsupported provider types', () => {
    expect(() => validateProviderType('teams')).toThrow(/Invalid provider type/i);
  });

  test('formatSlackPayload builds a Slack-friendly message for price alerts', () => {
    const payload = formatSlackPayload({
      occurredAt: '2026-04-23T15:00:00.000Z',
      payload: {
        symbol: 'AAPL',
        alertType: 'above',
        currentPrice: 205.15,
        targetPrice: 200,
        message: 'AAPL has reached $205.15, which is above your target of $200.00',
        triggeredAt: '2026-04-23T15:00:00.000Z'
      }
    });

    expect(payload.text).toContain('Price alert triggered');
    expect(payload.blocks[0].text.text).toContain('AAPL');
    expect(payload.blocks[1].text.text).toContain('above your target');
  });

  test('formatDiscordPayload builds a Discord embed for price alerts', () => {
    const payload = formatDiscordPayload({
      occurredAt: '2026-04-23T15:00:00.000Z',
      payload: {
        symbol: 'TSLA',
        alertType: 'below',
        currentPrice: 150.12,
        targetPrice: 155,
        message: 'TSLA has dropped to $150.12, which is below your target of $155.00',
        triggeredAt: '2026-04-23T15:00:00.000Z'
      }
    });

    expect(payload.content).toContain('TSLA');
    expect(payload.embeds[0].title).toContain('TSLA');
    expect(payload.embeds[0].fields.some((field) => field.name === 'Current Price')).toBe(true);
  });

  test('buildWebhookRequestBody preserves the default signed envelope for custom webhooks', () => {
    const body = buildWebhookRequestBody(
      { provider_type: 'custom' },
      {
        id: 'evt-1',
        type: 'price_alert.triggered',
        occurredAt: '2026-04-23T15:00:00.000Z',
        payload: { symbol: 'MSFT' },
        metadata: { source: 'test' }
      }
    );

    expect(body).toEqual({
      id: 'evt-1',
      type: 'price_alert.triggered',
      createdAt: '2026-04-23T15:00:00.000Z',
      data: { symbol: 'MSFT' },
      metadata: { source: 'test' }
    });
  });
});
