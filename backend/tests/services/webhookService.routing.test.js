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

jest.mock('../../src/services/tierService', () => ({
  isProUser: jest.fn()
}));

const TierService = require('../../src/services/tierService');
const WebhookSubscription = require('../../src/models/WebhookSubscription');
const { webhookService } = require('../../src/services/webhookService');

describe('webhookService event routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WebhookSubscription.listActiveByEventTypeForUser.mockResolvedValue([]);
    TierService.isProUser.mockResolvedValue(true);
  });

  test('does not deliver to users who are no longer Pro', async () => {
    WebhookSubscription.listActiveByEventTypeForUser.mockResolvedValue([{ id: 'wh-1', is_active: true }]);
    TierService.isProUser.mockResolvedValue(false);
    const deliverSpy = jest.spyOn(webhookService, 'deliverEventToWebhook');

    const result = await webhookService.handleDomainEvent({
      id: 'evt-4',
      type: 'trade.created',
      payload: { tradeId: 't-1' },
      metadata: { userId: 'free-user' }
    });

    expect(TierService.isProUser).toHaveBeenCalledWith('free-user');
    expect(deliverSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: 0, failed: 0, skipped: 1 });
    deliverSpy.mockRestore();
  });

  test('delivers to Pro users', async () => {
    WebhookSubscription.listActiveByEventTypeForUser.mockResolvedValue([{ id: 'wh-1', is_active: true }]);
    const deliverSpy = jest.spyOn(webhookService, 'deliverEventToWebhook').mockResolvedValue({ status: 'delivered' });

    const result = await webhookService.handleDomainEvent({
      id: 'evt-5',
      type: 'trade.created',
      payload: { tradeId: 't-1' },
      metadata: { userId: 'pro-user' }
    });

    expect(result).toEqual({ delivered: 1, failed: 0, skipped: 0 });
    deliverSpy.mockRestore();
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
