jest.mock('../../src/services/twentySyncService', () => ({
  initialize: jest.fn(),
  syncAll: jest.fn(),
  syncUser: jest.fn(),
}));

jest.mock('../../src/services/invoiceNinjaSyncService', () => ({
  initialize: jest.fn(),
  syncAll: jest.fn(),
  syncUser: jest.fn(),
}));

describe('crmSyncScheduler', () => {
  let twentySyncService;
  let invoiceNinjaSyncService;
  let crmSyncScheduler;

  beforeEach(() => {
    jest.resetModules();
    twentySyncService = require('../../src/services/twentySyncService');
    invoiceNinjaSyncService = require('../../src/services/invoiceNinjaSyncService');
    crmSyncScheduler = require('../../src/services/crmSyncScheduler');
    jest.clearAllMocks();
  });

  test('initializes sync services lazily for on-demand single-user syncs', async () => {
    twentySyncService.initialize.mockReturnValue(true);
    twentySyncService.syncUser.mockResolvedValue({ id: 'person-1' });
    invoiceNinjaSyncService.initialize.mockReturnValue(false);

    const result = await crmSyncScheduler.syncUser('user-1', { targets: ['twenty'] });

    expect(twentySyncService.initialize).toHaveBeenCalled();
    expect(twentySyncService.syncUser).toHaveBeenCalledWith('user-1');
    expect(result.twenty).toEqual({
      enabled: true,
      skipped: false,
      found: true,
      result: { id: 'person-1' },
    });
  });

  test('returns skipped metadata for integrations that are not configured', async () => {
    twentySyncService.initialize.mockReturnValue(false);
    invoiceNinjaSyncService.initialize.mockReturnValue(false);

    const result = await crmSyncScheduler.syncAll();

    expect(result.twenty).toEqual({
      enabled: false,
      synced: 0,
      errors: 0,
      skipped: true,
    });
    expect(result.invoiceNinja).toEqual({
      enabled: false,
      synced: 0,
      errors: 0,
      skipped: true,
    });
  });
});
