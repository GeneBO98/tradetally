jest.mock('../../../src/models/User', () => ({
  findById: jest.fn(),
  getSettings: jest.fn()
}));

jest.mock('../../../src/controllers/settings.controller', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn()
}));

jest.mock('../../../src/controllers/user.controller', () => ({
  updateProfile: jest.fn()
}));

const User = require('../../../src/models/User');
const settingsController = require('../../../src/controllers/settings.controller');
const userController = require('../../../src/controllers/user.controller');
const settingsV1Controller = require('../../../src/controllers/v1/settings.controller');

function createMockRes(requestId = 'req-settings') {
  return {
    req: { requestId, headers: {} },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('v1 settings controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('PUT /api/v1/settings/notifications maps to persisted emailNotifications field', async () => {
    settingsController.updateSettings.mockImplementation((req, res) => {
      expect(req.body).toEqual({ emailNotifications: true });
      res.json({ settings: { emailNotifications: true } });
    });

    const req = {
      body: { notifications: { email: true } },
      user: { id: 'u1' },
      headers: {},
      requestId: 'req-notifications'
    };
    const res = createMockRes('req-notifications');
    const next = jest.fn();

    await settingsV1Controller.updateNotificationSettings(req, res, next);

    expect(settingsController.updateSettings).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      updated: true,
      notifications: {
        email: true,
        push: {
          enabled: false,
          tradeClosed: false,
          dailySummary: false,
          weeklyReport: false,
          marketOpen: false,
          marketClose: false
        }
      }
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('GET /api/v1/settings/reset returns standardized NOT_IMPLEMENTED', async () => {
    const req = {
      user: { id: 'u1' },
      headers: {},
      requestId: 'req-reset'
    };
    const res = createMockRes('req-reset');
    const next = jest.fn();

    await settingsV1Controller.resetSettings(req, res, next);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Settings reset is not part of the supported public API yet'
      },
      requestId: 'req-reset'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('PUT /api/v1/settings/display updates theme and timezone through legacy adapters', async () => {
    settingsController.updateSettings.mockImplementation((req, res) => {
      res.json({ settings: { theme: req.body.theme } });
    });
    userController.updateProfile.mockImplementation((req, res) => {
      res.json({ user: { timezone: req.body.timezone } });
    });
    User.findById.mockResolvedValue({ id: 'u1', timezone: 'America/Chicago' });
    User.getSettings.mockResolvedValue({ theme: 'dark' });

    const req = {
      body: { theme: 'dark', timezone: 'America/Chicago' },
      user: { id: 'u1' },
      headers: {},
      requestId: 'req-display'
    };
    const res = createMockRes('req-display');
    const next = jest.fn();

    await settingsV1Controller.updateDisplaySettings(req, res, next);

    expect(settingsController.updateSettings).toHaveBeenCalled();
    expect(userController.updateProfile).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      updated: true,
      display: {
        theme: 'dark',
        currency: 'USD',
        timezone: 'America/Chicago',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
        language: 'en'
      }
    });
    expect(next).not.toHaveBeenCalled();
  });
});
