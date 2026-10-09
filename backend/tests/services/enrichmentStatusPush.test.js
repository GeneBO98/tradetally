jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/controllers/notifications.controller', () => ({
  sendEnrichmentUpdateToUser: jest.fn()
}));

const db = require('../../src/config/database');
const notificationsController = require('../../src/controllers/notifications.controller');
const { scheduleEnrichmentStatusPush, PUSH_INTERVAL_MS } = require('../../src/services/enrichmentStatusPush');

async function flushPush() {
  jest.advanceTimersByTime(PUSH_INTERVAL_MS);
  // Let the push's awaited query and send settle
  await Promise.resolve();
  await Promise.resolve();
}

describe('enrichmentStatusPush', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [{ enrichment_status: 'completed', count: '5' }] });
    notificationsController.sendEnrichmentUpdateToUser.mockResolvedValue();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('coalesces a burst of completions into one push per user', async () => {
    for (let i = 0; i < 50; i += 1) scheduleEnrichmentStatusPush('user-1');
    scheduleEnrichmentStatusPush('user-2');

    expect(db.query).not.toHaveBeenCalled();
    await flushPush();

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(notificationsController.sendEnrichmentUpdateToUser).toHaveBeenCalledWith('user-1', {
      tradeEnrichment: [{ enrichment_status: 'completed', count: '5' }]
    });
    expect(notificationsController.sendEnrichmentUpdateToUser).toHaveBeenCalledWith('user-2', expect.any(Object));
  });

  test('schedules a new push for completions after the previous one fired', async () => {
    scheduleEnrichmentStatusPush('user-3');
    await flushPush();
    scheduleEnrichmentStatusPush('user-3');
    await flushPush();

    expect(notificationsController.sendEnrichmentUpdateToUser).toHaveBeenCalledTimes(2);
  });
});
