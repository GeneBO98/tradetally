jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/brokerSync/encryptionService', () => ({
  encrypt: jest.fn(value => `encrypted:${value}`),
  decrypt: jest.fn(value => String(value).replace('encrypted:', ''))
}));

const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');

function schwabConnectionRow(overrides = {}) {
  return {
    id: 'connection-1',
    user_id: 'user-1',
    broker_type: 'schwab',
    connection_status: 'active',
    schwab_account_id: '11111111',
    schwab_token_expires_at: new Date('2026-08-21T12:00:00Z'),
    broker_metadata: {
      schwab_accounts: [
        { account_identifier: '****1111' },
        { account_identifier: '****2222' }
      ],
      excluded_account_identifiers: ['****1111']
    },
    account_label: 'Schwab',
    auto_sync_enabled: true,
    sync_frequency: 'daily',
    sync_time: '06:00:00',
    sync_start_date: null,
    last_sync_at: null,
    last_sync_status: null,
    last_sync_message: null,
    last_sync_trades_imported: 0,
    last_sync_trades_skipped: 0,
    next_scheduled_sync: null,
    consecutive_failures: 0,
    last_error_at: null,
    last_error_message: null,
    created_at: new Date('2026-08-21T12:00:00Z'),
    updated_at: new Date('2026-08-21T12:00:00Z'),
    ...overrides
  };
}

describe('BrokerConnection Schwab account metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('exposes only redacted discovered accounts and exclusions', () => {
    const connection = BrokerConnection.formatConnection(schwabConnectionRow(), false);

    expect(connection).toMatchObject({
      schwab_accounts: [
        { account_identifier: '****1111' },
        { account_identifier: '****2222' }
      ],
      excluded_account_identifiers: ['****1111']
    });
    expect(connection).not.toHaveProperty('brokerMetadata');
  });

  test('merges account settings into existing broker metadata', async () => {
    db.query.mockResolvedValueOnce({ rows: [schwabConnectionRow()] });

    await BrokerConnection.updateBrokerMetadata('connection-1', {
      excluded_account_identifiers: ['****1111']
    });

    const [query, params] = db.query.mock.calls[0];
    expect(query).toContain("COALESCE(broker_metadata, '{}'::jsonb) || $2::jsonb");
    expect(params).toEqual([
      'connection-1',
      JSON.stringify({ excluded_account_identifiers: ['****1111'] })
    ]);
  });
});
