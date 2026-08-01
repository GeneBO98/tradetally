jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/brokerSync/encryptionService', () => ({
  encrypt: jest.fn(value => value),
  decrypt: jest.fn(value => value)
}));

const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');

describe('BrokerConnection sync state updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
  });

  test('preserves the successful-sync cursor when no latest report was retrieved', async () => {
    await BrokerConnection.updateAfterSync('connection-1', 0, 0, new Date('2026-08-01T10:00:00Z'), {
      advanceLastSync: false
    });

    const [query, params] = db.query.mock.calls[0];
    expect(query).toContain('last_sync_at = CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE last_sync_at END');
    expect(query).toContain("last_sync_status = CASE WHEN $5 THEN 'success' ELSE 'warning' END");
    expect(params[4]).toBe(false);
  });

  test('moves a due transient retry into the future instead of leaving it due', async () => {
    await BrokerConnection.scheduleTransientRetry('connection-1', 30);

    const [query, params] = db.query.mock.calls[0];
    expect(query).toContain('next_scheduled_sync IS NULL OR next_scheduled_sync <= NOW()');
    expect(query).toContain("THEN NOW() + ($2 || ' minutes')::interval");
    expect(params).toEqual(['connection-1', '30']);
  });

  test('can clear stale scheduler failures after a successful connection test', async () => {
    await BrokerConnection.updateStatus('connection-1', 'active', 'Connection test successful', true);

    const [query, params] = db.query.mock.calls[0];
    expect(query).toContain('consecutive_failures = CASE WHEN $4 THEN 0 ELSE consecutive_failures END');
    expect(query).toContain('last_error_message = CASE WHEN $4 THEN NULL ELSE last_error_message END');
    expect(params).toEqual(['connection-1', 'active', 'Connection test successful', true]);
  });
});
