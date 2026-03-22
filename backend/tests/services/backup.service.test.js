jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('archiver', () => jest.fn());

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(),
    unlink: jest.fn().mockResolvedValue(),
    writeFile: jest.fn().mockResolvedValue(),
    stat: jest.fn().mockResolvedValue({ size: 0 }),
    access: jest.fn().mockResolvedValue()
  },
  createWriteStream: jest.fn()
}));

const path = require('path');
const db = require('../../src/config/database');
const fs = require('fs').promises;
const backupService = require('../../src/services/backup.service');

describe('backup service hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.mkdir.mockResolvedValue();
  });

  test('deleteOldBackups parameterizes retention and only unlinks safe backup paths', async () => {
    const safePath = path.join(backupService.backupDir, 'safe.json');

    db.query
      .mockResolvedValueOnce({
        rows: [
          { id: 'backup-1', file_path: '../../etc/passwd' },
          { id: 'backup-2', file_path: safePath }
        ]
      })
      .mockResolvedValue({ rows: [] });

    const deletedCount = await backupService.deleteOldBackups('30');

    expect(deletedCount).toBe(2);

    const [selectQuery, selectParams] = db.query.mock.calls[0];
    expect(selectQuery).toContain("WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')");
    expect(selectParams).toEqual([30]);

    expect(fs.unlink).toHaveBeenCalledTimes(1);
    expect(fs.unlink).toHaveBeenCalledWith(safePath);
    expect(db.query).toHaveBeenCalledWith('DELETE FROM backups WHERE id = $1', ['backup-1']);
    expect(db.query).toHaveBeenCalledWith('DELETE FROM backups WHERE id = $1', ['backup-2']);
  });

  test('deleteOldBackups rejects invalid retention values', async () => {
    await expect(backupService.deleteOldBackups('0')).rejects.toThrow(
      'Retention days must be an integer between 1 and 365'
    );
    expect(db.query).not.toHaveBeenCalled();
  });
});
