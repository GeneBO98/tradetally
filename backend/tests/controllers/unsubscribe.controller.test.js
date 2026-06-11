jest.mock('../../src/models/User', () => ({
  getMarketingConsentById: jest.fn(),
  updateMarketingConsent: jest.fn()
}));

jest.mock('../../src/services/sequenzySubscriberSyncService', () => ({
  queueSyncUserById: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../src/services/sequenzySubscriberSyncService', () => ({
  queueSyncUserById: jest.fn()
}));

const User = require('../../src/models/User');
const sequenzySubscriberSyncService = require('../../src/services/sequenzySubscriberSyncService');
const unsubscribeController = require('../../src/controllers/unsubscribe.controller');
const unsubscribeService = require('../../src/services/unsubscribeService');

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
}

describe('unsubscribe controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-unsubscribe-secret';
  });

  test('one-click POST with query token unsubscribes a UUID user', async () => {
    const userId = '7f4af2f4-64b0-4ffc-a834-4b2578402e3d';
    const token = unsubscribeService.generateToken(userId);
    User.updateMarketingConsent.mockResolvedValue(true);

    const req = {
      body: {},
      query: { token }
    };
    const res = createResponse();

    await unsubscribeController.handleUnsubscribe(req, res);

    expect(User.updateMarketingConsent).toHaveBeenCalledWith(userId, false);
    expect(sequenzySubscriberSyncService.queueSyncUserById).toHaveBeenCalledWith(userId);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      success: true,
      message: 'Successfully unsubscribed from marketing emails'
    });
  });

  test('web form POST with body token unsubscribes a UUID user', async () => {
    const userId = '7f4af2f4-64b0-4ffc-a834-4b2578402e3d';
    const token = unsubscribeService.generateToken(userId);
    User.updateMarketingConsent.mockResolvedValue(true);

    const req = {
      body: { token },
      query: {}
    };
    const res = createResponse();

    await unsubscribeController.handleUnsubscribe(req, res);

    expect(User.updateMarketingConsent).toHaveBeenCalledWith(userId, false);
    expect(sequenzySubscriberSyncService.queueSyncUserById).toHaveBeenCalledWith(userId);
    expect(res.statusCode).toBe(200);
  });
});
