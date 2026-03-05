const { validate, schemas } = require('../../src/middleware/validation');

function createMockRes(requestId = 'req-validation') {
  return {
    req: { requestId, headers: {} },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('v1 validation envelope', () => {
  test('returns standardized VALIDATION_ERROR shape for v1 requests', () => {
    const middleware = validate(schemas.changePassword);
    const req = {
      originalUrl: '/api/v1/users/password',
      body: {},
      headers: {},
      requestId: 'req-validation'
    };
    const res = createMockRes('req-validation');
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: expect.any(Array)
      },
      requestId: 'req-validation'
    });
    expect(next).not.toHaveBeenCalled();
  });
});
