const {
  createRequestId,
  isV1Request,
  sendV1Error,
  sendV1NotImplemented,
  sendV1Paginated
} = require('../src/utils/apiResponse');

function createMockRes(requestId = 'req-123') {
  return {
    req: { requestId, headers: {} },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('v1 apiResponse helpers', () => {
  test('createRequestId returns a non-empty value', () => {
    const requestId = createRequestId();
    expect(typeof requestId).toBe('string');
    expect(requestId.length).toBeGreaterThan(0);
  });

  test('isV1Request detects v1 API requests', () => {
    expect(isV1Request({ originalUrl: '/api/v1/trades' })).toBe(true);
    expect(isV1Request({ baseUrl: '/api/v1' })).toBe(true);
    expect(isV1Request({ path: '/api/trades' })).toBe(false);
  });

  test('sendV1Error emits standardized error envelope', () => {
    const res = createMockRes();

    sendV1Error(res, 404, 'NOT_FOUND', 'Trade not found', { id: 'missing' });

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_FOUND',
        message: 'Trade not found',
        details: { id: 'missing' }
      },
      requestId: 'req-123'
    });
  });

  test('sendV1NotImplemented uses NOT_IMPLEMENTED code', () => {
    const res = createMockRes('req-501');

    sendV1NotImplemented(res, 'Not available');

    expect(res.status).toHaveBeenCalledWith(501);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Not available'
      },
      requestId: 'req-501'
    });
  });

  test('sendV1Paginated emits data and pagination envelope', () => {
    const res = createMockRes();
    const data = [{ id: 't1' }, { id: 't2' }];
    const pagination = { limit: 2, offset: 0, total: 10, hasMore: true };

    sendV1Paginated(res, data, pagination);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data,
      pagination
    });
  });
});
