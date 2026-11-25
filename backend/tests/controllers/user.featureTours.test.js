jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/User', () => ({
  setFeatureTourStatus: jest.fn(),
  resetFeatureTour: jest.fn()
}));
jest.mock('../../src/models/Trade', () => ({}));
jest.mock('../../src/services/tierService', () => ({}));
jest.mock('../../src/services/emailService', () => ({}));
jest.mock('../../src/services/apiUsageService', () => ({}));
jest.mock('../../src/services/tradeQuality.service', () => ({}));
jest.mock('../../src/utils/imageProcessor', () => ({}));
jest.mock('../../src/services/refreshToken.service', () => ({}));
jest.mock('../../src/services/billingService', () => ({}));
jest.mock('../../src/middleware/auth', () => ({ clearAuthUserCache: jest.fn() }));

const User = require('../../src/models/User');
const userController = require('../../src/controllers/user.controller');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('feature tour endpoints', () => {
  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    User.setFeatureTourStatus.mockResolvedValue({ tour_id: '2026-11-new-features', status: 'completed' });
  });

  it('records a completed tour for the signed-in user', async () => {
    const res = mockRes();
    await userController.setFeatureTourStatus(
      { user: { id: 'user-1' }, params: { tourId: '2026-11-new-features' }, body: { status: 'completed', lastStep: 4 } },
      res,
      next
    );
    expect(User.setFeatureTourStatus).toHaveBeenCalledWith('user-1', '2026-11-new-features', 'completed', 4);
    expect(res.json).toHaveBeenCalledWith({ success: true, tour: { tour_id: '2026-11-new-features', status: 'completed' } });
  });

  it('records a dismissal and ignores an invalid step', async () => {
    const res = mockRes();
    await userController.setFeatureTourStatus(
      { user: { id: 'user-1' }, params: { tourId: 'tour-a' }, body: { status: 'dismissed', lastStep: 'x' } },
      res,
      next
    );
    expect(User.setFeatureTourStatus).toHaveBeenCalledWith('user-1', 'tour-a', 'dismissed', null);
  });

  it.each([
    ['bad id', { tourId: 'Bad Id!' }, { status: 'completed' }],
    ['too long id', { tourId: 'a'.repeat(65) }, { status: 'completed' }],
    ['unknown status', { tourId: 'tour-a' }, { status: 'started' }],
    ['missing body', { tourId: 'tour-a' }, undefined]
  ])('rejects %s', async (_label, params, body) => {
    const res = mockRes();
    await userController.setFeatureTourStatus({ user: { id: 'user-1' }, params, body }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.setFeatureTourStatus).not.toHaveBeenCalled();
  });

  it('resets a tour so it can be replayed', async () => {
    const res = mockRes();
    await userController.resetFeatureTour({ user: { id: 'user-1' }, params: { tourId: 'tour-a' } }, res, next);
    expect(User.resetFeatureTour).toHaveBeenCalledWith('user-1', 'tour-a');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
