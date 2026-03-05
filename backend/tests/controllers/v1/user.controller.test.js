jest.mock('../../../src/models/User', () => ({
  findById: jest.fn(),
  getSettings: jest.fn()
}));

jest.mock('../../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../../src/controllers/user.controller', () => ({
  updateProfile: jest.fn(),
  uploadAvatar: jest.fn(),
  deleteAvatar: jest.fn()
}));

jest.mock('../../../src/controllers/settings.controller', () => ({
  updateSettings: jest.fn()
}));

const User = require('../../../src/models/User');
const db = require('../../../src/config/database');
const userController = require('../../../src/controllers/user.controller');
const userV1Controller = require('../../../src/controllers/v1/user.controller');

function createMockRes(requestId = 'req-user') {
  return {
    req: { requestId, headers: {} },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('v1 user controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('PUT /api/v1/users/profile delegates to legacy update and returns profile', async () => {
    userController.updateProfile.mockImplementation((req, res) => {
      res.status(200).json({
        user: { id: 'u1', fullName: 'Updated Name', timezone: 'America/New_York' },
        message: 'Profile updated'
      });
    });

    const req = {
      body: { fullName: 'Updated Name', timezone: 'America/New_York' },
      user: { id: 'u1' },
      headers: {},
      requestId: 'req-profile'
    };
    const res = createMockRes('req-profile');
    const next = jest.fn();

    await userV1Controller.updateProfile(req, res, next);

    expect(userController.updateProfile).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      profile: { id: 'u1', fullName: 'Updated Name', timezone: 'America/New_York' },
      message: 'Profile updated'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('POST /api/v1/users/sync-info returns standardized NOT_IMPLEMENTED', async () => {
    const req = {
      user: { id: 'u1' },
      headers: {},
      requestId: 'req-sync-update'
    };
    const res = createMockRes('req-sync-update');
    const next = jest.fn();

    await userV1Controller.updateSyncInfo(req, res, next);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Sync info updates are not part of the supported public API yet'
      },
      requestId: 'req-sync-update'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('GET /api/v1/users/sync-info returns computed device count', async () => {
    db.query.mockResolvedValue({ rows: [{ count: 4 }] });
    User.findById.mockResolvedValue({ id: 'u1' });

    const req = {
      user: { id: 'u1' },
      headers: {},
      requestId: 'req-sync-read'
    };
    const res = createMockRes('req-sync-read');
    const next = jest.fn();

    await userV1Controller.getSyncInfo(req, res, next);

    expect(db.query).toHaveBeenCalledWith(
      'SELECT COUNT(*)::integer AS count FROM devices WHERE user_id = $1',
      ['u1']
    );
    expect(res.json).toHaveBeenCalledWith({
      sync: {
        lastSyncAt: null,
        syncVersion: 0,
        pendingChanges: 0,
        conflictsCount: 0,
        deviceCount: 4,
        enabled: false
      }
    });
    expect(next).not.toHaveBeenCalled();
  });
});
