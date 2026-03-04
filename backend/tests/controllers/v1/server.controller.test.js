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
          sync: false,
          offline_support: false,
          conflict_resolution: false,
          real_time: false
        }),
        platform: expect.objectContaining({
          websockets: false
        })
      })
    });
    expect(next).not.toHaveBeenCalled();
  });
});
