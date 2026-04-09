jest.mock('../../src/services/crmSyncScheduler', () => ({
  getStatus: jest.fn(),
  syncAll: jest.fn(),
  syncUser: jest.fn(),
}));

const controller = require('../../src/controllers/internalCrmSync.controller');
const crmSyncScheduler = require('../../src/services/crmSyncScheduler');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('internal CRM sync controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns scheduler status', async () => {
    crmSyncScheduler.getStatus.mockReturnValue({ schedulerRunning: false });
    const req = {};
    const res = createRes();
    const next = jest.fn();

    await controller.getStatus(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      status: { schedulerRunning: false },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 202 when full sync is already in progress', async () => {
    crmSyncScheduler.syncAll.mockResolvedValue({
      skipped: true,
      reason: 'sync_in_progress',
      targets: ['twenty', 'invoiceNinja'],
    });
    const req = { body: {} };
    const res = createRes();
    const next = jest.fn();

    await controller.runFullSync(req, res, next);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      message: 'CRM sync already in progress; skipping duplicate request',
      code: 'CRM_SYNC_IN_PROGRESS',
      result: {
        skipped: true,
        reason: 'sync_in_progress',
        targets: ['twenty', 'invoiceNinja'],
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 404 when a requested user is not found in enabled integrations', async () => {
    crmSyncScheduler.syncUser.mockResolvedValue({
      twenty: { enabled: true, found: false, result: null },
      invoiceNinja: { enabled: true, found: false, result: null },
    });
    const req = { params: { userId: 'missing-user' }, body: {} };
    const res = createRes();
    const next = jest.fn();

    await controller.syncUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'User not found for CRM sync',
      code: 'CRM_SYNC_USER_NOT_FOUND',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns sync results for a successful single-user sync', async () => {
    crmSyncScheduler.syncUser.mockResolvedValue({
      twenty: { enabled: true, found: true, result: { id: 'person-1' } },
    });
    const req = { params: { userId: 'user-1' }, body: { targets: ['twenty'] } };
    const res = createRes();
    const next = jest.fn();

    await controller.syncUser(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      message: 'User CRM sync completed',
      result: {
        twenty: { enabled: true, found: true, result: { id: 'person-1' } },
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
