// Real foreign-key and transaction-lock coverage. Only run on the disposable
// TEST_DATABASE_URL database: snapshot restore intentionally clears its tables.
jest.mock('../../src/services/optionStrategyGroupingService', () => ({
  rebuildUserGroupsSafe: jest.fn().mockResolvedValue()
}));

const { randomUUID } = require('crypto');
const db = require('../../src/config/database');
const backup_service = require('../../src/services/backup.service');
const contracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

describe('backup restore with real PostgreSQL', () => {
  let original_backup;
  beforeAll(async () => {
    original_backup = await backup_service.fetchAllData();
    expect(original_backup.tables.migrations).toBeUndefined();
  });
  afterAll(async () => {
    try {
      if (original_backup) await backup_service.restoreFromBackup(original_backup, { clearExisting: true });
    } finally {
      await db.pool.end();
    }
  });

  test.each(['camel', 'snake'])('snapshot restores %s-case parents and closed option P&L in one pass', async format => {
    const migration_history = await db.query('SELECT * FROM migrations ORDER BY id');
    expect(migration_history.rows.length).toBeGreaterThan(0);
    const user_id = randomUUID();
    const broker_id = randomUUID();
    const group_id = randomUUID();
    const user = {
      id: user_id, email: `restore-${user_id}@example.com`,
      username: `restore_${user_id.slice(0, 8)}`, password_hash: 'test-only',
      timezone: 'America/Chicago'
    };
    const trades = contracts.backup_restore_cases.map(({ trade }) => ({
      ...trade, id: randomUUID(), user_id, broker_connection_id: broker_id,
      position_group_id: group_id, underlying_symbol: 'PLTR',
      option_type: 'call', strike_price: 180, expiration_date: '2026-08-29'
    }));
    // Complete fills near midnight UTC must use the newly restored timezone.
    const timezone_trade = {
      ...trades[3], id: randomUUID(), entry_time: '2026-08-06T01:00:00Z',
      executions: [{ ...trades[3].executions[0], entry_time: '2026-08-06T01:00:00Z' }]
    };
    trades.push(timezone_trade);
    const backup = { tables: {
      users: [user], trades,
      migrations: [{ id: 999999, filename: 'not-a-target-migration.sql', checksum: 'test-only' }],
      [format === 'camel' ? 'brokerConnections' : 'broker_connections']: [
        { id: broker_id, user_id, broker_type: 'schwab' }
      ],
      [format === 'camel' ? 'tradePositionGroups' : 'trade_position_groups']: [
        { id: group_id, user_id, underlying_symbol: 'PLTR' }
      ]
    } };

    const result = await backup_service.restoreFromBackup(backup, { clearExisting: true });
    expect(result.results.trades).toEqual({ added: trades.length, skipped: 0, errors: 0 });
    expect(result.results.other.errors).toBe(0);
    expect((await db.query('SELECT * FROM migrations ORDER BY id')).rows).toEqual(migration_history.rows);
    const restored = await db.query('SELECT * FROM trades WHERE user_id = $1', [user_id]);
    expect(restored.rows).toHaveLength(trades.length);
    for (const [index, fixture] of contracts.backup_restore_cases.entries()) {
      const row = restored.rows.find(trade => trade.id === trades[index].id);
      expect(Number(row.pnl)).toBeCloseTo(fixture.expected.pnl, 8);
      expect(Number(row.quantity)).toBe(fixture.expected.quantity);
      expect(row.broker_connection_id).toBe(broker_id);
      expect(row.position_group_id).toBe(group_id);
    }
    expect(restored.rows.find(trade => trade.id === timezone_trade.id).trade_date).toBe('2026-08-05');

    const repeated = await backup_service.restoreFromBackup(backup, { overwriteUsers: true });
    expect(repeated.results.trades).toEqual({ added: 0, skipped: trades.length, errors: 0 });
  });
});
