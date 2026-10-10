jest.mock('../../src/models/BrokerConnection', () => ({
  findDueForSync: jest.fn()
}));
jest.mock('../../src/services/brokerSync', () => ({
  syncConnection: jest.fn()
}));
jest.mock('../../src/services/brokerSync/brokerReauthNotificationService', () => ({
  sendDueReminders: jest.fn()
}));
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const BrokerConnection = require('../../src/models/BrokerConnection');
const BrokerReauthNotificationService = require('../../src/services/brokerSync/brokerReauthNotificationService');
const brokerSyncService = require('../../src/services/brokerSync');
const brokerSyncScheduler = require('../../src/services/brokerSync/brokerSyncScheduler');

describe('BrokerSyncScheduler Schwab reauthorization reminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    brokerSyncScheduler.isRunning = false;
    BrokerConnection.findDueForSync.mockResolvedValue([]);
    BrokerReauthNotificationService.sendDueReminders.mockResolvedValue({
      claimed: 1,
      sent: 1,
      failed: 0
    });
  });

  test('routes a due IBKR cursor as an exact backfill retry', async () => {
    brokerSyncService.syncConnection.mockResolvedValue({ success: true });
    const retry = require('../../../tests/fixtures/trading-calculation-contracts.json').ibkr_backfill_retry;

    await brokerSyncScheduler.syncConnection({
      id: 'connection-1',
      brokerType: 'ibkr',
      ibkrBackfillRetry: retry
    });

    expect(brokerSyncService.syncConnection).toHaveBeenCalledWith('connection-1', {
      syncType: 'ibkr_timeout_retry',
      startDate: '2024-01-01',
      endDate: '2025-12-31',
      referenceCode: 'REF-RETRY'
    });
  });

  test('checks pre-expiration reminders even when no trade sync is due', async () => {
    await brokerSyncScheduler.processDueSyncs();

    expect(BrokerReauthNotificationService.sendDueReminders).toHaveBeenCalledTimes(1);
    expect(BrokerConnection.findDueForSync).toHaveBeenCalledTimes(1);
  });
});
