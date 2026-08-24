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

  test('checks pre-expiration reminders even when no trade sync is due', async () => {
    await brokerSyncScheduler.processDueSyncs();

    expect(BrokerReauthNotificationService.sendDueReminders).toHaveBeenCalledTimes(1);
    expect(BrokerConnection.findDueForSync).toHaveBeenCalledTimes(1);
  });
});
