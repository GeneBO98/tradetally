const mockDbQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

jest.mock('../../src/config/database', () => ({
  query: mockDbQuery,
  pool: {
    connect: jest.fn(async () => ({
      query: mockClientQuery,
      release: mockClientRelease
    }))
  }
}));

const {
  ensureMigrationsTable,
  getAppliedMigrations,
  getMigrationSchema,
  qualifiedName,
  recordMigration,
  syncMigrationsSequence
} = require('../../src/utils/migrate');

describe('migration schema handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DB_SCHEMA;
  });

  test('uses DB_SCHEMA when explicitly configured', async () => {
    process.env.DB_SCHEMA = 'tradetally';

    await expect(getMigrationSchema()).resolves.toBe('tradetally');

    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  test('falls back to current_schema from the active search_path', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ schema: 'custom_path' }] });

    await expect(getMigrationSchema()).resolves.toBe('custom_path');

    expect(mockDbQuery).toHaveBeenCalledWith('SELECT current_schema() AS schema');
  });

  test('checks and creates migrations table in the resolved schema', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ exists: false }] })
      .mockResolvedValueOnce({});

    await ensureMigrationsTable('tradetally');

    expect(mockDbQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE table_schema = $1'),
      ['tradetally']
    );
    expect(mockDbQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('CREATE TABLE "tradetally"."migrations"')
    );
  });

  test('reads applied migrations from the resolved schema', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ filename: '001.sql', checksum: 'abc123' }]
    });

    const applied = await getAppliedMigrations('tradetally');

    expect(mockDbQuery).toHaveBeenCalledWith(
      'SELECT filename, checksum FROM "tradetally"."migrations" ORDER BY id'
    );
    expect(applied.get('001.sql')).toBe('abc123');
  });

  test('records migrations in the resolved schema', async () => {
    mockClientQuery.mockResolvedValueOnce({});

    await recordMigration({ query: mockClientQuery }, 'tradetally', '001.sql', 'abc123');

    expect(mockClientQuery).toHaveBeenCalledWith(
      'INSERT INTO "tradetally"."migrations" (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING',
      ['001.sql', 'abc123']
    );
  });

  test('syncs migrations sequence in the resolved schema', async () => {
    mockDbQuery.mockResolvedValueOnce({});

    await syncMigrationsSequence('tradetally');

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('pg_get_serial_sequence($1, \'id\')'),
      ['"tradetally"."migrations"']
    );
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT MAX(id) FROM "tradetally"."migrations"'),
      ['"tradetally"."migrations"']
    );
  });

  test('quotes schema identifiers safely', () => {
    expect(qualifiedName('trade"tally', 'migrations')).toBe('"trade""tally"."migrations"');
  });
});
