jest.mock('../../src/models/WebhookSubscription', () => ({
  recordDelivery: jest.fn(),
  updateForUser: jest.fn()
}));

jest.mock('../../src/utils/urlSecurity', () => ({
  fetchWithValidatedRedirects: jest.fn(),
  ensureValidatedOutboundUrl: jest.fn(),
  OutboundUrlValidationError: class OutboundUrlValidationError extends Error {}
}));

const WebhookSubscription = require('../../src/models/WebhookSubscription');
const { fetchWithValidatedRedirects } = require('../../src/utils/urlSecurity');
const { webhookService } = require('../../src/services/webhookService');

describe('webhookService delivery formatting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchWithValidatedRedirects.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('ok')
    });
    WebhookSubscription.recordDelivery.mockResolvedValue({});
    WebhookSubscription.updateForUser.mockResolvedValue({});
  });

  test('delivers Slack-formatted payloads for Slack destinations', async () => {
    await webhookService.deliverEventToWebhook(
      {
        id: 'wh-1',
        user_id: 'user-1',
        url: 'https://hooks.slack.com/services/test',
        secret: 'whsec_test_secret',
        provider_type: 'slack',
        custom_headers: {},
        is_active: true,
        failure_count: 0
      },
      {
        id: 'evt-1',
        type: 'price_alert.triggered',
        occurredAt: '2026-04-23T15:00:00.000Z',
        payload: {
          symbol: 'AAPL',
          alertType: 'above',
          currentPrice: 205.15,
          targetPrice: 200,
          message: 'AAPL has reached $205.15, which is above your target of $200.00',
          triggeredAt: '2026-04-23T15:00:00.000Z'
        },
        metadata: { source: 'test' }
      }
    );

    const fetchOptions = fetchWithValidatedRedirects.mock.calls[0][2];
    const requestBody = JSON.parse(fetchOptions.body);

    expect(requestBody.text).toContain('Price alert triggered');
    expect(requestBody.blocks[0].text.text).toContain('AAPL');
    expect(fetchOptions.headers['X-TradeTally-Event']).toBe('price_alert.triggered');

    expect(WebhookSubscription.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookId: 'wh-1',
        eventType: 'price_alert.triggered',
        status: 'delivered',
        requestBody: expect.objectContaining({
          text: expect.stringContaining('Price alert triggered')
        })
      })
    );
  });
});
