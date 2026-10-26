jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/BrokerConnection', () => ({ create: jest.fn(), findById: jest.fn(), updateStatus: jest.fn(), calculateNextSync: jest.fn(), update: jest.fn() }));
jest.mock('../../src/services/brokerSync', () => ({}));
jest.mock('../../src/services/brokerSync/oandaService', () => ({ list_accounts: jest.fn(), get_account: jest.fn() }));
jest.mock('../../src/services/tierService', () => ({ canCreateBrokerConnection: jest.fn() }));
jest.mock('../../src/utils/timezone', () => ({ getUserTimezone: jest.fn().mockResolvedValue('UTC') }));
const controller = require('../../src/controllers/brokerSync.controller');
const BrokerConnection = require('../../src/models/BrokerConnection');
const service = require('../../src/services/brokerSync/oandaService');
const TierService = require('../../src/services/tierService');

const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const request = () => ({ user: { id: 'owner' }, headers: {}, body: {
  api_token: 'secret-token', broker_environment: 'practice', account_id: '101-001-123456-001',
  account_label: 'Practice', auto_sync_enabled: false, sync_frequency: 'daily', sync_time: '06:00:00', sync_start_date: null
} });

beforeEach(() => {
  jest.clearAllMocks();
  TierService.canCreateBrokerConnection.mockResolvedValue({ allowed: true });
});

test.each(['getOandaAccounts', 'addOandaConnection'])('%s checks tier access before contacting OANDA', async method => {
  TierService.canCreateBrokerConnection.mockResolvedValue({ allowed: false, message: 'Pro required' });
  const res = response();
  await controller[method](request(), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(service.list_accounts).not.toHaveBeenCalled();
  expect(service.get_account).not.toHaveBeenCalled();
  expect(BrokerConnection.create).not.toHaveBeenCalled();
});

test('account discovery returns account IDs without credentials', async () => {
  service.list_accounts.mockResolvedValue([{ account_id: '101-001-123456-001' }]);
  const res = response();
  await controller.getOandaAccounts(request(), res, jest.fn());
  expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ account_id: '101-001-123456-001' }] });
});

test('validates access to the selected account before saving an encrypted connection', async () => {
  service.get_account.mockResolvedValue({ currency: 'GBP', alias: 'OANDA account' });
  BrokerConnection.create.mockResolvedValue({ id: 'saved-connection' });
  BrokerConnection.findById.mockResolvedValue({ id: 'saved-connection', brokerType: 'oanda' });
  const res = response();
  const next = jest.fn();
  await controller.addOandaConnection(request(), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(service.get_account).toHaveBeenCalledWith('secret-token', 'practice', '101-001-123456-001');
  expect(BrokerConnection.create).toHaveBeenCalledWith('owner', expect.objectContaining({ oanda_api_token: 'secret-token', brokerMetadata: { currency: 'GBP' } }));
  expect(res.status).toHaveBeenCalledWith(201);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret-token');
});

test('surfaces sanitized authentication failures without saving a connection', async () => {
  const error = Object.assign(new Error('OANDA rejected access'), { status: 400 });
  service.get_account.mockRejectedValue(error);
  const res = response();
  await controller.addOandaConnection(request(), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ success: false, error: 'OANDA rejected access' });
  expect(BrokerConnection.create).not.toHaveBeenCalled();
});
