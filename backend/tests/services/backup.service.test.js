jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  connect: jest.fn()
}));

jest.mock('archiver', () => jest.fn());

jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn() }));
jest.mock('../../src/services/optionStrategyGroupingService', () => ({
  rebuildUserGroupsSafe: jest.fn()
}));

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
const contracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

function createRestoreClient(columnsByTable = {}, user_ids = []) {
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
      if (normalized === 'SELECT id FROM users') return { rows: user_ids.map(id => ({ id })) };
      if (normalized.startsWith('SELECT timezone FROM users')) return { rows: [{ timezone: 'UTC' }] };
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

  test.each(contracts.backup_restore_cases)('restores calculation contract: $id', async ({ trade, expected }) => {
    const row = { id: 'trade-1', user_id: 'user-1', ...trade };
    const client = createRestoreClient({ trades: Object.keys(row) }, ['user-1']);
    const result = await backupService.restoreFromBackup({ tables: { trades: [row] } });

    expect(result.results.trades).toEqual({ added: 1, skipped: 0, errors: 0 });
    const [sql, values] = client.query.mock.calls.find(([query]) => String(query).startsWith('INSERT INTO "trades"'));
    const columns = sql.match(/\(([^)]+)\) VALUES/)[1].split(', ').map(column => column.replaceAll('"', ''));
    const restored = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    expect(restored).toMatchObject(expected);
    expect(db.query).not.toHaveBeenCalledWith('SELECT timezone FROM users WHERE id = $1', expect.anything());
  });

  test.each(['camel', 'snake'])('restores %s-case trade parents before their trades', async format => {
    const client = createRestoreClient({
      trades: ['id', 'user_id', 'broker_connection_id', 'position_group_id'],
      broker_connections: ['id', 'user_id'],
      trade_position_groups: ['id', 'user_id']
    }, ['user-1']);
    const result = await backupService.restoreFromBackup({ tables: {
      trades: [{ id: 'trade-1', user_id: 'user-1', broker_connection_id: 'broker-1', position_group_id: 'group-1' }],
      [format === 'camel' ? 'brokerConnections' : 'broker_connections']: [{ id: 'broker-1', user_id: 'user-1' }],
      [format === 'camel' ? 'tradePositionGroups' : 'trade_position_groups']: [{ id: 'group-1', user_id: 'user-1' }]
    } }, { clearExisting: true });

    const inserts = client.query.mock.calls.filter(([query]) => String(query).startsWith('INSERT INTO'));
    expect(inserts.map(([sql]) => sql.match(/INSERT INTO "([^"]+)"/)[1])).toEqual([
      'broker_connections', 'trade_position_groups', 'trades'
    ]);
    expect(result.results.other).toEqual({ added: 2, skipped: 0, errors: 0 });
    expect(result.results.trades.errors).toBe(0);
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
