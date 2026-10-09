jest.mock('../../src/models/WebhookSubscription', () => ({
  listActiveByEventTypeForUser: jest.fn(),
  recordDelivery: jest.fn(),
  updateForUser: jest.fn()
}));

jest.mock('../../src/utils/urlSecurity', () => ({
  fetchWithValidatedRedirects: jest.fn(),
  ensureValidatedOutboundUrl: jest.fn(),
  OutboundUrlValidationError: class OutboundUrlValidationError extends Error {}
}));

const WebhookSubscription = require('../../src/models/WebhookSubscription');
const { webhookService } = require('../../src/services/webhookService');

describe('webhookService event routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WebhookSubscription.listActiveByEventTypeForUser.mockResolvedValue([]);
  });

  test('looks up subscriptions only for the user in the event metadata', async () => {
    await webhookService.handleDomainEvent({
      id: 'evt-1',
      type: 'trade.created',
      payload: { tradeId: 't-1' },
      metadata: { userId: 'user-1' }
    });

    expect(WebhookSubscription.listActiveByEventTypeForUser).toHaveBeenCalledWith('trade.created', 'user-1');
  });

  test('falls back to the user id in the payload', async () => {
    await webhookService.handleDomainEvent({
      id: 'evt-2',
      type: 'price_alert.triggered',
      payload: { userId: 'user-2', symbol: 'AAPL' },
      metadata: { source: 'priceMonitoringService.triggerAlert' }
    });

    expect(WebhookSubscription.listActiveByEventTypeForUser).toHaveBeenCalledWith('price_alert.triggered', 'user-2');
  });

  test('drops events without an owner instead of broadcasting them', async () => {
    const result = await webhookService.handleDomainEvent({
      id: 'evt-3',
      type: 'import.completed',
      payload: { importId: 'i-1' },
      metadata: {}
    });

    expect(result).toEqual({ delivered: 0, failed: 0, skipped: 0 });
    expect(WebhookSubscription.listActiveByEventTypeForUser).not.toHaveBeenCalled();
  });
});
