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

  test('marks reauthorization required only when the connection transitions to expired', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'connection-1',
        user_id: 'user-1',
        broker_type: 'schwab',
        connection_status: 'expired'
      }]
    });

    const result = await BrokerConnection.markReauthRequired(
      'connection-1',
      'Charles Schwab authentication expired.'
    );

    const [query, params] = db.query.mock.calls[0];
    expect(query).toContain("connection_status <> 'expired'");
    expect(query).toContain("last_sync_status = 'failed'");
    expect(params).toEqual(['connection-1', 'Charles Schwab authentication expired.']);
    expect(result.connectionStatus).toBe('expired');
  });

  test('Schwab OAuth upsert preserves the existing connection settings', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'connection-1',
        user_id: 'user-1',
        broker_type: 'schwab',
        connection_status: 'pending'
      }]
    });

    await BrokerConnection.create('user-1', {
      brokerType: 'schwab',
      schwabAccessToken: 'access-token',
      schwabRefreshToken: 'refresh-token',
      schwabTokenExpiresAt: new Date('2026-08-24T12:00:00Z'),
      schwabRefreshTokenExpiresAt: new Date('2026-08-31T11:30:00Z'),
      schwabAccountId: '12345678'
    });

    const [query] = db.query.mock.calls[0];
    expect(query).toContain("ON CONFLICT (user_id) WHERE broker_type = 'schwab' DO UPDATE SET");
    expect(query).not.toContain('account_label = EXCLUDED.account_label');
    expect(query).not.toContain('auto_sync_enabled = EXCLUDED.auto_sync_enabled');
    expect(query).not.toContain('sync_frequency = EXCLUDED.sync_frequency');
    expect(query).not.toContain('sync_time = EXCLUDED.sync_time');
    expect(query).not.toContain('sync_start_date = EXCLUDED.sync_start_date');
    expect(query).toContain('schwab_refresh_token_expires_at = EXCLUDED.schwab_refresh_token_expires_at');
    expect(query).toContain('schwab_reauth_reminder_sent_at = NULL');
  });

  test('atomically claims Schwab reminders only in the final 24 hours', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await BrokerConnection.claimDueSchwabReauthReminders();

    const [query, params] = db.query.mock.calls[0];
    expect(query).toContain("broker_type = 'schwab'");
    expect(query).toContain("connection_status = 'active'");
    expect(query).toContain("CURRENT_TIMESTAMP + INTERVAL '24 hours'");
    expect(query).toContain('schwab_reauth_reminder_sent_at IS NULL');
    expect(params).toBeUndefined();
  });
});
