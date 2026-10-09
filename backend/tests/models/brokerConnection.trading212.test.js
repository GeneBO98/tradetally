jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/brokerSync/encryptionService', () => ({
  encrypt: jest.fn(value => `encrypted:${value}`),
  decrypt: jest.fn(value => String(value).replace('encrypted:', ''))
}));

const db = require('../../src/config/database');
const encryptionService = require('../../src/services/brokerSync/encryptionService');
const BrokerConnection = require('../../src/models/BrokerConnection');

function connectionRow(overrides = {}) {
  return {
    id: 'connection-1',
    user_id: 'user-1',
    broker_type: 'trading212',
    connection_status: 'pending',
    trading212_api_key: 'encrypted:key-1',
    trading212_api_secret: 'encrypted:secret-1',
    external_account_id: '12345678',
    broker_environment: 'live',
    broker_metadata: { currency: 'GBP' },
    account_label: 'Main ISA',
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
    created_at: new Date('2026-07-11T12:00:00Z'),
    updated_at: new Date('2026-07-11T12:00:00Z'),
    ...overrides
  };
}

describe('BrokerConnection Trading 212 credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('encrypts the API key and secret before inserting the connection', async () => {
    db.query.mockResolvedValue({ rows: [connectionRow()] });

    const result = await BrokerConnection.create('user-1', {
      brokerType: 'trading212',
      trading212ApiKey: 'key-1',
      trading212ApiSecret: 'secret-1',
      externalAccountId: '12345678',
      brokerEnvironment: 'live',
      brokerMetadata: { currency: 'GBP' },
      accountLabel: 'Main ISA',
      autoSyncEnabled: true,
      syncFrequency: 'daily',
      syncTime: '06:00:00'
    });

    expect(encryptionService.encrypt).toHaveBeenCalledWith('key-1');
    expect(encryptionService.encrypt).toHaveBeenCalledWith('secret-1');
    expect(db.query.mock.calls[0][1]).toContain('encrypted:key-1');
    expect(db.query.mock.calls[0][1]).toContain('encrypted:secret-1');
    expect(result).not.toHaveProperty('trading212ApiKey');
    expect(result).not.toHaveProperty('trading212ApiSecret');
  });

  test('only decrypts credentials for internal sync reads', () => {
    const publicConnection = BrokerConnection.formatConnection(connectionRow(), false);
    const internalConnection = BrokerConnection.formatConnection(connectionRow(), true);

    expect(publicConnection).not.toHaveProperty('trading212ApiKey');
    expect(publicConnection).not.toHaveProperty('trading212ApiSecret');
    expect(internalConnection).toMatchObject({
      trading212ApiKey: 'key-1',
      trading212ApiSecret: 'secret-1',
      brokerEnvironment: 'live'
    });
  });
});
