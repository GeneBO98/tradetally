const { requireInternalServiceAuth } = require('../../src/middleware/internalServiceAuth');

function createReq(headers = {}) {
  return { headers };
}

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('internal service auth middleware', () => {
  const originalSecret = process.env.KESTRA_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.KESTRA_INTERNAL_API_SECRET = 'super-secret';
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.KESTRA_INTERNAL_API_SECRET;
    } else {
      process.env.KESTRA_INTERNAL_API_SECRET = originalSecret;
    }
  });

  test('allows requests with the configured shared secret', () => {
    const req = createReq({
      'x-internal-service-secret': 'super-secret',
      'x-internal-service-name': 'kestra',
    });
    const res = createRes();
    const next = jest.fn();

    requireInternalServiceAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.internalService).toEqual({ name: 'kestra' });
  });

  test('rejects requests with a missing secret', () => {
    const req = createReq();
    const res = createRes();
    const next = jest.fn();

    requireInternalServiceAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal service secret required',
      code: 'INTERNAL_SERVICE_AUTH_REQUIRED',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects requests with an invalid secret', () => {
    const req = createReq({ 'x-internal-service-secret': 'wrong-secret' });
    const res = createRes();
    const next = jest.fn();

    requireInternalServiceAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid internal service secret',
      code: 'INVALID_INTERNAL_SERVICE_SECRET',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
