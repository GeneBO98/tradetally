const requestIdMiddleware = require('../../src/middleware/requestId');

function createMockRes() {
  return {
    setHeader: jest.fn()
  };
}

describe('requestId middleware', () => {
  test('reuses client-provided X-Request-ID', () => {
    const req = {
      headers: { 'x-request-id': 'client-id-1' }
    };
    const res = createMockRes();
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('client-id-1');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'client-id-1');
    expect(next).toHaveBeenCalled();
  });

  test('generates X-Request-ID when missing', () => {
    const req = {
      headers: {}
    };
    const res = createMockRes();
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(typeof req.requestId).toBe('string');
    expect(req.requestId.length).toBeGreaterThan(0);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(next).toHaveBeenCalled();
  });
});
