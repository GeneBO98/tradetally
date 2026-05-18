jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/services/sseFanoutService', () => ({
  getSseFanoutStatus: jest.fn(() => ({ configured: true, enabled: true, subscribed: true, channel: 'test:sse' })),
  publishSseNotification: jest.fn().mockResolvedValue(true),
  startSseFanout: jest.fn().mockResolvedValue({})
}));

const notificationsController = require('../../src/controllers/notifications.controller');
const sseFanoutService = require('../../src/services/sseFanoutService');

describe('notifications SSE connection controls', () => {
  const { sseConnections, evictOldestConnectionIfNeeded } = notificationsController._test;

  beforeEach(() => {
    sseConnections.clear();
    process.env.MAX_SSE_CONNECTIONS = '2';
  });

  afterEach(() => {
    sseConnections.clear();
    delete process.env.MAX_SSE_CONNECTIONS;
  });

  test('evicts the oldest connection when the global SSE cap is reached', () => {
    const oldestRes = { destroyed: false, writableEnded: false, end: jest.fn() };
    const newestRes = { destroyed: false, writableEnded: false, end: jest.fn() };
    const oldestHeartbeat = setInterval(() => {}, 1000);
    const newestHeartbeat = setInterval(() => {}, 1000);
    oldestHeartbeat.unref?.();
    newestHeartbeat.unref?.();

    sseConnections.set('user-oldest', {
      res: oldestRes,
      heartbeatInterval: oldestHeartbeat,
      connectedAt: 1
    });
    sseConnections.set('user-newest', {
      res: newestRes,
      heartbeatInterval: newestHeartbeat,
      connectedAt: 2
    });

    const evicted = evictOldestConnectionIfNeeded('user-incoming');

    expect(evicted).toBe('user-oldest');
    expect(oldestRes.end).toHaveBeenCalled();
    expect(sseConnections.has('user-oldest')).toBe(false);
    expect(sseConnections.has('user-newest')).toBe(true);
  });

  test('publishes notification through Redis fanout and local connection', async () => {
    const res = { destroyed: false, writableEnded: false, write: jest.fn() };
    sseConnections.set('user-1', {
      res,
      heartbeatInterval: null,
      connectedAt: Date.now()
    });

    const sent = await notificationsController.sendNotificationToUser('user-1', {
      type: 'price_alert',
      data: { symbol: 'AAPL' }
    });

    expect(sent).toBe(true);
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('price_alert'));
    expect(sseFanoutService.publishSseNotification).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ type: 'price_alert' })
    );
  });
});
