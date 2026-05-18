jest.mock('../../src/models/BrokerConnection', () => ({}));
jest.mock('../../src/services/brokerSync/ibkrService', () => ({}));
jest.mock('../../src/services/brokerSync/schwabService', () => ({}));
jest.mock('../../src/services/brokerSync', () => ({}));
jest.mock('../../src/services/analyticsCache', () => ({}));
jest.mock('../../src/utils/cache', () => ({ data: {}, del: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logError: jest.fn() }));

const brokerSyncController = require('../../src/controllers/brokerSync.controller');

describe('brokerSyncController Schwab OAuth callback', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.example.com';
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('URL-encodes provider error text before redirecting to the frontend', async () => {
    const req = {
      query: {
        error: 'access_denied&next=https://evil.example/#fragment'
      }
    };
    const res = {
      redirect: jest.fn()
    };
    const next = jest.fn();

    await brokerSyncController.handleSchwabCallback(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledTimes(1);
    const redirectUrl = res.redirect.mock.calls[0][0];
    expect(redirectUrl).toBe(
      'https://app.example.com/settings/broker-sync?error=access_denied%26next%3Dhttps%3A%2F%2Fevil.example%2F%23fragment'
    );
    expect(new URL(redirectUrl).searchParams.get('error')).toBe(req.query.error);
  });
});
