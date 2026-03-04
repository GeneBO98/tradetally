const analyticsController = require('../../src/controllers/analytics.controller');

function createMockRes(requestId = 'req-analytics') {
  return {
    req: { requestId, headers: {} },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('placeholder analytics endpoints', () => {
  const notImplementedMethods = [
    'getProfitLoss',
    'getWinRate',
    'getMonthlySummary',
    'getDailyAnalytics',
    'getWeeklyAnalytics',
    'getMonthlyAnalytics',
    'getYearlyAnalytics',
    'getRiskMetrics',
    'getTradeDistribution'
  ];

  test.each(notImplementedMethods)('%s returns 501 NOT_IMPLEMENTED', async (methodName) => {
    const req = {
      originalUrl: '/api/v1/analytics/test',
      headers: {},
      requestId: 'req-analytics'
    };
    const res = createMockRes('req-analytics');
    const next = jest.fn();

    await analyticsController[methodName](req, res, next);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: expect.any(String)
      },
      requestId: 'req-analytics'
    });
    expect(next).not.toHaveBeenCalled();
  });
});
