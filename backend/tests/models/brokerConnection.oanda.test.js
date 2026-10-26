jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/brokerSync/encryptionService', () => ({
  encrypt: jest.fn(value => `encrypted:${value}`), decrypt: jest.fn(value => value.slice(10))
}));
const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');
const encryption = require('../../src/services/brokerSync/encryptionService');
const row = {
  id: 'connection', broker_type: 'oanda', user_id: 'user', oanda_api_token: 'encrypted:token',
  external_account_id: '101-001-123456-001', broker_environment: 'practice', broker_metadata: { currency: 'USD' }
};

test('encrypts tokens and scopes reconnects to the user, account and environment', async () => {
  db.query.mockResolvedValue({ rows: [row] });
  const result = await BrokerConnection.create('user', {
    brokerType: 'oanda', oanda_api_token: 'token', externalAccountId: row.external_account_id, brokerEnvironment: 'practice'
  });
  expect(encryption.encrypt).toHaveBeenCalledWith('token');
  expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT (user_id, broker_environment, external_account_id)');
  expect(db.query.mock.calls[0][1]).toContain('encrypted:token');
  expect(result).not.toHaveProperty('oanda_api_token');
});

test('returns credentials only for internal reads', () => {
  expect(BrokerConnection.formatConnection(row)).not.toHaveProperty('oanda_api_token');
  expect(BrokerConnection.formatConnection(row, true).oanda_api_token).toBe('token');
});
