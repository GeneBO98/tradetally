jest.mock('../../../src/config/database', () => ({
  query: jest.fn()
}));

const serverV1Controller = require('../../../src/controllers/v1/server.controller');

function createMockRes(requestId = 'req-server') {
  return {
    req: { requestId, headers: {} },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('v1 server controller', () => {
  test('GET /api/v1/server/capabilities does not claim unsupported sync/websocket features', async () => {
    const req = {
      headers: {},
      requestId: 'req-capabilities'
    };
    const res = createMockRes('req-capabilities');
    const next = jest.fn();

    await serverV1Controller.getCapabilities(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      capabilities: expect.objectContaining({
        data: expect.objectContaining({
          trade_crud: true,
          bulk_operations: true
        }),
        platform: expect.objectContaining({
          request_ids: true,
          rate_limiting: true
        }),
        authentication: expect.objectContaining({
          api_keys: true
        })
      })
    });
    // These features were removed from the capabilities object
    const caps = res.json.mock.calls[0][0].capabilities;
    expect(caps.data.sync).toBeUndefined();
    expect(caps.data.offline_support).toBeUndefined();
    expect(caps.platform.websockets).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });
});
