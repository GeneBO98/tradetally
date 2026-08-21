jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  connect: jest.fn()
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

function createRestoreClient(columnsByTable = {}) {
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql, params = []) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized.includes('FROM information_schema.columns')) {
        const columns = columnsByTable[params[0]] || [];
        return { rows: columns.map(column => ({ column_name: column, data_type: 'text' })) };
      }
      if (normalized.includes("tc.constraint_type = 'PRIMARY KEY'")) {
        return { rows: [{ column_name: 'id' }] };
      }
      if (normalized === 'SELECT id FROM users') return { rows: [] };
      if (normalized.startsWith('INSERT INTO')) return { rows: [{ id: 'restored-id' }] };
      return { rows: [] };
    })
  };
  db.connect.mockResolvedValue(client);
  return client;
}

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

  test('createFullSiteBackup ensures backup directory before writing file', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'backup-1',
          filename: 'backup.json',
          file_path: path.join(backupService.backupDir, 'backup.json'),
          status: 'completed'
        }]
      });

    await backupService.createFullSiteBackup('user-1', 'manual');

    expect(fs.mkdir).toHaveBeenCalledWith(backupService.backupDir, { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.mkdir.mock.invocationCallOrder[0]).toBeLessThan(fs.writeFile.mock.invocationCallOrder[0]);
  });

  test('ignores a malicious backup table key before constructing SQL', async () => {
    const client = createRestoreClient();

    await backupService.restoreFromBackup({
      tables: { 'evil); DROP TABLE users;--': [{ id: 'row-1' }] },
      tableNameMapping: {}
    });

    const sql = client.query.mock.calls.map(([query]) => String(query)).join('\n');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('evil)');
  });

  test('rejects a malicious table-name mapping before metadata or inserts', async () => {
    const client = createRestoreClient();

    await backupService.restoreFromBackup({
      tables: { activityEvents: [{ id: 'row-1' }] },
      tableNameMapping: { activityEvents: 'users; DROP TABLE users;--' }
    });

    const sql = client.query.mock.calls.map(([query]) => String(query)).join('\n');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('INSERT INTO');
  });

  test('skips a backup table that does not exist in the target schema', async () => {
    const client = createRestoreClient();

    await backupService.restoreFromBackup({
      tables: { unknownTable: [{ id: 'row-1' }] },
      tableNameMapping: { unknownTable: 'unknown_table' }
    });

    expect(client.query.mock.calls.some(([query]) => String(query).startsWith('INSERT INTO'))).toBe(false);
  });

  test('skips a row with no recognized target columns', async () => {
    const client = createRestoreClient({ custom_table: ['id'] });

    const result = await backupService.restoreFromBackup({
      tables: { customTable: [{ unexpected: 'value' }] },
      tableNameMapping: { customTable: 'custom_table' }
    });

    expect(result.tableResults.custom_table.skipped).toBe(1);
    expect(client.query.mock.calls.some(([query]) => String(query).startsWith('INSERT INTO'))).toBe(false);
  });

  test('quotes validated table and column identifiers during a valid restore', async () => {
    const client = createRestoreClient({ custom_table: ['id', 'label'] });

    await backupService.restoreFromBackup({
      tables: { customTable: [{ id: 'row-1', label: 'Safe' }] },
      tableNameMapping: { customTable: 'custom_table' }
    });

    const insert = client.query.mock.calls.find(([query]) => String(query).startsWith('INSERT INTO'));
    expect(insert[0]).toContain('INSERT INTO "custom_table" ("id", "label")');
    expect(insert[0]).toContain('RETURNING "id"');
  });
});
