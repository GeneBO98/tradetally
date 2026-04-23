jest.mock('../../src/services/webhookService', () => ({
  webhookService: {
    listWebhooks: jest.fn(),
    createWebhook: jest.fn(),
    getWebhook: jest.fn(),
    updateWebhook: jest.fn(),
    deleteWebhook: jest.fn(),
    triggerTestDelivery: jest.fn(),
    listDeliveries: jest.fn()
  }
}));

const { webhookService } = require('../../src/services/webhookService');
const controller = require('../../src/controllers/priceAlertWebhooks.controller');

function createMockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('priceAlertWebhooks controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('listWebhooks scopes results to the price_alert.triggered event', async () => {
    webhookService.listWebhooks.mockResolvedValue({ webhooks: [], total: 0 });

    const req = { query: {}, user: { id: 'user-1' } };
    const res = createMockRes();
    const next = jest.fn();

    await controller.listWebhooks(req, res, next);

    expect(webhookService.listWebhooks).toHaveBeenCalledWith('user-1', expect.objectContaining({
      exactEventTypes: ['price_alert.triggered']
    }));
    expect(next).not.toHaveBeenCalled();
  });

  test('createWebhook forces the price alert event type', async () => {
    webhookService.createWebhook.mockResolvedValue({ id: 'wh-1' });

    const req = {
      body: {
        providerType: 'slack',
        url: 'https://hooks.slack.com/services/test',
        eventTypes: ['trade.created']
      },
      user: { id: 'user-1' }
    };
    const res = createMockRes();
    const next = jest.fn();

    await controller.createWebhook(req, res, next);

    expect(webhookService.createWebhook).toHaveBeenCalledWith('user-1', expect.objectContaining({
      eventTypes: ['price_alert.triggered']
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });
});
