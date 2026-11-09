jest.mock('../../src/models/BrokerConnection', () => ({
  acquireSyncLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
  findById: jest.fn(), createSyncLog: jest.fn().mockResolvedValue({ id: 'log' }),
  updateSyncLog: jest.fn(), updateConfirmationSync: jest.fn(), updateAfterSync: jest.fn(),
  clearIBKRBackfillRetry: jest.fn(), updateAfterFailure: jest.fn()
}));
jest.mock('../../src/services/brokerSync/ibkrService', () => ({ syncConfirmations: jest.fn(), syncTrades: jest.fn() }));
jest.mock('../../src/services/brokerSync/brokerReauthNotificationService', () => ({ markRequired: jest.fn() }));
jest.mock('../../src/services/tierService', () => ({ canSyncBrokerConnection: jest.fn().mockResolvedValue({ allowed: true }) }));
jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [{ count: 2 }] }) }));
jest.mock('../../src/events/domainEvents', () => ({ publishInBackground: jest.fn() }));
const BrokerConnection = require('../../src/models/BrokerConnection');
const ibkr = require('../../src/services/brokerSync/ibkrService');
const service = require('../../src/services/brokerSync');
const reauth = require('../../src/services/brokerSync/brokerReauthNotificationService');
const connection = { id: 'connection', userId: 'owner', brokerType: 'ibkr', connectionStatus: 'active',
  ibkr_trade_confirmation_query_id: 'confirmation', brokerMetadata: { ibkr_confirmation: { retry_count: 1 } },
  ibkrBackfillRetry: { reference_code: 'ACTIVITY-REF' } };

beforeEach(() => {
  jest.clearAllMocks();
  BrokerConnection.findById.mockResolvedValue(connection);
  ibkr.syncConfirmations.mockResolvedValue({ imported: 1, updated: 2, duplicates: 3, failed: 0, skipped: 0,
    warnings: [], reportFormats: ['xml'], manualReviewItems: [], manualReviewCount: 0, outcome: 'success' });
});

test('confirmation-only sync never advances Activity cursor or runs expiry processing', async () => {
  const expiry = jest.spyOn(service, 'closeExpiredOptions');
  const result = await service.syncConnection('connection', { syncType: 'ibkr_confirmation', report_type: 'trade_confirmation' });
  expect(result).toMatchObject({ success: true, imported: 1, updated: 2, pending_reconciliation_count: 2 });
  expect(ibkr.syncTrades).not.toHaveBeenCalled();
  expect(expiry).not.toHaveBeenCalled();
  expect(BrokerConnection.updateAfterSync).not.toHaveBeenCalled();
  expect(BrokerConnection.clearIBKRBackfillRetry).not.toHaveBeenCalled();
  expect(BrokerConnection.updateSyncLog).toHaveBeenCalledWith('log', 'completed', expect.objectContaining({
    syncDetails: expect.objectContaining({ report_type: 'trade_confirmation', updated_count: 2 })
  }));
  expiry.mockRestore();
});

test('bad optional query does not fail the Activity connection or ask to replace its token', async () => {
  ibkr.syncConfirmations.mockRejectedValue(Object.assign(new Error('Query invalid'), { errorCode: '1014' }));
  expect(await service.syncConnection('connection', { report_type: 'trade_confirmation' })).toMatchObject({ success: false });
  expect(BrokerConnection.updateConfirmationSync).toHaveBeenCalledWith('connection', expect.objectContaining({ error: expect.objectContaining({ errorCode: '1014' }) }));
  expect(BrokerConnection.updateAfterFailure).not.toHaveBeenCalled();
  expect(reauth.markRequired).not.toHaveBeenCalled();
});

test('expired shared token invokes the existing reconnect flow', async () => {
  ibkr.syncConfirmations.mockRejectedValue(Object.assign(new Error('Token expired'), { errorCode: '1012' }));
  await service.syncConnection('connection', { report_type: 'trade_confirmation' });
  expect(reauth.markRequired).toHaveBeenCalledTimes(1);
});

test('manual all sync completes confirmation work first and retains its result after Activity fails', async () => {
  const actual = service.syncConnectionUnlocked;
  const unlocked = jest.spyOn(service, 'syncConnectionUnlocked');
  const order = [];
  unlocked.mockImplementation(async (id, options) => {
    if (!options.report_type) return actual.call(service, id, options);
    order.push(options.report_type);
    if (options.report_type === 'activity') throw new Error('Activity unavailable');
    return { success: true, imported: 1, updated: 2 };
  });
  try {
    const result = await service.syncConnection('connection');
    expect(order).toEqual(['trade_confirmation', 'activity']);
    expect(result).toMatchObject({ success: false, imported: 1, updated: 2 });
    expect(result.warnings).toContain('Activity unavailable');
  } finally { unlocked.mockRestore(); }
});
