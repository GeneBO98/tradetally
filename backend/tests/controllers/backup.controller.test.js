jest.mock('../../src/services/backup.service', () => ({
  getBackups: jest.fn(),
  getBackupById: jest.fn(),
  resolveBackupPath: jest.fn(),
  deleteOldBackups: jest.fn()
}));

const backupController = require('../../src/controllers/backup.controller');
const backupService = require('../../src/services/backup.service');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    download: jest.fn()
  };
}

describe('backup controller hardening', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('getBackups rejects invalid limit values', async () => {
    const req = { query: { limit: '0' } };
    const res = createRes();
    const next = jest.fn();

    await backupController.getBackups(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Limit must be an integer between 1 and 100' });
    expect(next).not.toHaveBeenCalled();
    expect(backupService.getBackups).not.toHaveBeenCalled();
  });

  test('cleanupOldBackups rejects invalid retention days', async () => {
    const req = { body: { days: '500' } };
    const res = createRes();
    const next = jest.fn();

    await backupController.cleanupOldBackups(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Retention days must be an integer between 1 and 365' });
    expect(next).not.toHaveBeenCalled();
    expect(backupService.deleteOldBackups).not.toHaveBeenCalled();
  });

  test('downloadBackup rejects unsafe backup paths', async () => {
    backupService.getBackupById.mockResolvedValue({
      status: 'completed',
      file_path: '../../etc/passwd'
    });
    backupService.resolveBackupPath.mockImplementation(() => {
      throw new Error('Invalid backup path');
    });

    const req = { params: { id: 'backup-1' } };
    const res = createRes();
    const next = jest.fn();

    await backupController.downloadBackup(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid backup path' });
    expect(next).not.toHaveBeenCalled();
  });
});
