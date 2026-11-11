jest.mock('../../src/models/BrokerConnection', () => ({ findById: jest.fn(), update: jest.fn(), getSyncLogs: jest.fn(), getSyncLogsByUser: jest.fn() }));
jest.mock('../../src/utils/timezone', () => ({ getUserTimezone: jest.fn().mockResolvedValue('America/New_York') }));
jest.mock('../../src/services/brokerSync/syncHistory', () => ({ getHistory: jest.fn(), getDay: jest.fn() }));
jest.mock('../../src/services/brokerSync/ibkrService', () => ({ validateCredentials: jest.fn() }));
const BrokerConnection = require('../../src/models/BrokerConnection');
const history = require('../../src/services/brokerSync/syncHistory');
const ibkr = require('../../src/services/brokerSync/ibkrService');
const controller = require('../../src/controllers/brokerSync.controller');
const { schemas } = require('../../src/middleware/validation');
const connection_id = '2f73bd1b-f929-4839-a4b8-ea2029b42ac';
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const request = (query = {}) => ({ user: { id: 'owner' }, params: { id: connection_id }, query, body: {} });
beforeEach(() => {
  jest.clearAllMocks();
  BrokerConnection.findById.mockResolvedValue({ id: connection_id, userId: 'owner', brokerType: 'ibkr' });
  history.getHistory.mockResolvedValue({ data: [], has_more: true });
  history.getDay.mockResolvedValue({ data: [], has_more: false });
});

test('root grouping uses authenticated ownership and the saved timezone', async () => {
  const res = response(), next = jest.fn();
  await controller.getAllSyncLogs(request({ group_by: 'day', limit: '20', offset: '40' }), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(history.getHistory).toHaveBeenCalledWith('owner', { timezone: 'America/New_York', limit: 20, offset: 40 });
  expect(res.json).toHaveBeenCalledWith({ success: true, data: [], has_more: true });
});
test('expanded history checks connection ownership before reading any logs', async () => {
  BrokerConnection.findById.mockResolvedValue({ id: connection_id, userId: 'someone-else' });
  const res = response();
  await controller.getSyncLogs(request({ group_date: '2026-11-11' }), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(404);
  expect(history.getDay).not.toHaveBeenCalled();
});
test.each([{ group_by: 'day', limit: '-1' }, { group_by: 'day', offset: '1.5' },
  { group_date: '2026-02-30' }, { group_date: 'invalid' }, { group_date: ['2026-11-11'] },
  { group_by: 'day', limit: '101' }, { group_by: 'day', offset: '1000001' }])('rejects malformed history options %j', async query => {
  const res = response();
  await controller.getSyncLogs(request(query), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(history.getDay).not.toHaveBeenCalled();
  expect(history.getHistory).not.toHaveBeenCalled();
});
test('legacy consumers continue to receive individual log rows', async () => {
  const res = response();
  BrokerConnection.getSyncLogs.mockResolvedValue([{ id: 'raw' }]);
  await controller.getSyncLogs(request(), res, jest.fn());
  expect(BrokerConnection.getSyncLogs).toHaveBeenCalledWith(connection_id, 20);
  expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 'raw' }] });
});
test('changing only the interval does not contact IBKR or reset its saved query', async () => {
  const req = request(); req.body = { ibkr_confirmation_interval_minutes: 60 };
  const next = jest.fn();
  await controller.updateConnection(req, response(), next);
  expect(next).not.toHaveBeenCalled();
  expect(BrokerConnection.update).toHaveBeenCalledWith(connection_id, { ibkr_confirmation_interval_minutes: 60 });
  expect(ibkr.validateCredentials).not.toHaveBeenCalled();
});
test('rejects confirmation intervals on another broker', async () => {
  BrokerConnection.findById.mockResolvedValue({ id: connection_id, userId: 'owner', brokerType: 'schwab' });
  const req = request(); req.body = { ibkr_confirmation_interval_minutes: 60 };
  const res = response();
  await controller.updateConnection(req, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(BrokerConnection.update).not.toHaveBeenCalled();
});
test.each([0, 10, 16, 22.5, 1441, null])('interval %j is rejected by create and update validation', value => {
  expect(schemas.brokerSyncConnectionUpdate.validate({ ibkr_confirmation_interval_minutes: value }).error).toBeTruthy();
  expect(schemas.brokerSyncIbkrConnection.validate({ flexToken: 'token', flexQueryId: 'activity', ibkr_confirmation_interval_minutes: value }).error).toBeTruthy();
});
test.each([15, 30, 60, 1440])('interval %s is accepted without adding a default to omitted updates', value => {
  expect(schemas.brokerSyncConnectionUpdate.validate({ ibkr_confirmation_interval_minutes: value }).error).toBeUndefined();
  expect(schemas.brokerSyncIbkrConnection.validate({ flexToken: 'token', flexQueryId: 'activity' }).value).not.toHaveProperty('ibkr_confirmation_interval_minutes');
});
