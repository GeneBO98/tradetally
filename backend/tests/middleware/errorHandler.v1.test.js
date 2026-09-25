const errorHandler = require('../../src/middleware/errorHandler');

function createReq() {
  return { originalUrl: '/api/v1/trades/not-a-uuid', headers: {}, requestId: 'req-err' };
}

function createRes(req) {
  return {
    req,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('v1 error handler', () => {
  let consoleError;
  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  test('maps malformed JSON bodies to 400 INVALID_JSON instead of 500', () => {
    const req = createReq();
    const res = createRes(req);
    const err = Object.assign(new SyntaxError('Unexpected token } in JSON'), {
      status: 400, type: 'entity.parse.failed', expose: true
    });

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('INVALID_JSON');
  });

  test('maps oversized bodies to 413', () => {
    const req = createReq();
    const res = createRes(req);
    const err = Object.assign(new Error('request entity too large'), {
      status: 413, type: 'entity.too.large', expose: true
    });

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json.mock.calls[0][0].error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('maps Postgres invalid_text_representation (bad UUID) to 400', () => {
    const req = createReq();
    const res = createRes(req);
    const err = Object.assign(new Error('invalid input syntax for type uuid: "not-a-uuid"'), { code: '22P02' });

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('BAD_REQUEST');
    // The raw database message is not leaked.
    expect(res.json.mock.calls[0][0].error.message).not.toContain('uuid');
  });

  test('unexpected errors still return 500', () => {
    const req = createReq();
    const res = createRes(req);

    errorHandler(new Error('boom'), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.code).toBe('INTERNAL_ERROR');
  });
});
