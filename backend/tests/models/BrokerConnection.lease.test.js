jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/services/brokerSync/encryptionService', () => ({
  encrypt: jest.fn(value => `encrypted:${value}`),
  decrypt: jest.fn(value => String(value).replace(/^encrypted:/, ''))
}));

const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');

describe('BrokerConnection sync lease metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('heartbeats only the worker that owns a sync claim', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'connection-1',
        user_id: 'user-1',
        broker_type: 'ibkr',
        connection_status: 'active',
        sync_claimed_at: '2026-05-11T13:00:00Z',
        sync_heartbeat_at: '2026-05-11T13:05:00Z',
        sync_claimed_by: 'worker-1'
      }]
    });

    await BrokerConnection.heartbeatSyncClaim('connection-1', 'worker-1');

    expect(db.query.mock.calls[0][0]).toContain('sync_claimed_by = $2');
    expect(db.query.mock.calls[0][1]).toEqual(['connection-1', 'worker-1']);
  });

  test('summarizes active and expired sync leases', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'connection-1',
          user_id: 'user-1',
          broker_type: 'ibkr',
          connection_status: 'active',
          sync_claimed_at: '2026-05-11T13:00:00Z',
          sync_heartbeat_at: '2026-05-11T13:05:00Z',
          sync_claimed_by: 'worker-1',
          lease_age_seconds: 120,
          heartbeat_age_seconds: 30,
          is_expired: false
        },
        {
          id: 'connection-2',
          user_id: 'user-1',
          broker_type: 'schwab',
          connection_status: 'active',
          sync_claimed_at: '2026-05-11T12:00:00Z',
          sync_heartbeat_at: '2026-05-11T12:01:00Z',
          sync_claimed_by: 'worker-2',
          lease_age_seconds: 3600,
          heartbeat_age_seconds: 3500,
          is_expired: true
        }
      ]
    });

    const metrics = await BrokerConnection.getSyncLeaseMetrics('user-1');

    expect(metrics.total).toBe(2);
    expect(metrics.active).toBe(1);
    expect(metrics.expired).toBe(1);
    expect(metrics.leases[0]).toMatchObject({
      id: 'connection-1',
      userId: 'user-1',
      syncClaimedBy: 'worker-1'
    });
  });

  test('redacts broker tokens before storing connection failure messages', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'connection-1',
        user_id: 'user-1',
        broker_type: 'ibkr',
        connection_status: 'error',
        last_error_message: 'request failed https://flex.example/report?t=[REDACTED]&q=[REDACTED]'
      }]
    });

    await BrokerConnection.updateAfterFailure(
      'connection-1',
      'request failed https://flex.example/report?t=raw-flex-token&q=raw-query-id'
    );

    expect(db.query.mock.calls[0][1][1]).toBe(
      'request failed https://flex.example/report?t=[REDACTED]&q=[REDACTED]'
    );
  });

  test('redacts broker tokens before storing sync log errors', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'log-1',
        connection_id: 'connection-1',
        user_id: 'user-1',
        sync_type: 'manual',
        status: 'failed',
        error_message: 'failed'
      }]
    });

    await BrokerConnection.updateSyncLog('log-1', 'failed', {
      errorMessage: 'axios failed https://flex.example/report?t=raw-flex-token&q=raw-query-id',
      errorDetails: {
        url: 'https://flex.example/report?t=raw-flex-token&q=raw-query-id',
        token: 'raw-flex-token'
      }
    });

    expect(db.query.mock.calls[0][1][7]).toBe(
      'axios failed https://flex.example/report?t=[REDACTED]&q=[REDACTED]'
    );
    expect(db.query.mock.calls[0][1][8]).toContain('[REDACTED]');
    expect(db.query.mock.calls[0][1][8]).not.toContain('raw-flex-token');
  });
});
