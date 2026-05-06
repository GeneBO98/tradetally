const mockDb = {
  query: jest.fn()
};

const mockEmailService = {
  sendTrialExpirationEmail: jest.fn()
};

jest.mock('../../src/config/database', () => mockDb);
jest.mock('../../src/services/emailService', () => mockEmailService);

const TrialScheduler = require('../../src/services/trialScheduler');

describe('trialScheduler unsubscribe handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('trial reminders only select marketing subscribers and pass user ID for unsubscribe links', async () => {
    const user = {
      id: '7f4af2f4-64b0-4ffc-a834-4b2578402e3d',
      email: 'user@example.com',
      username: 'user',
      full_name: 'Test User'
    };

    mockDb.query
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [] });
    mockEmailService.sendTrialExpirationEmail.mockResolvedValue();

    await TrialScheduler.sendTrialReminders(1);

    expect(mockDb.query.mock.calls[0][0]).toContain('u.marketing_consent = true');
    expect(mockEmailService.sendTrialExpirationEmail).toHaveBeenCalledWith(
      user.email,
      user.username,
      1,
      user.id
    );
  });

  test('trial expiration notices only select marketing subscribers and pass user ID for unsubscribe links', async () => {
    const user = {
      id: '7f4af2f4-64b0-4ffc-a834-4b2578402e3d',
      email: 'user@example.com',
      username: 'user',
      full_name: 'Test User'
    };

    mockDb.query
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [] });
    mockEmailService.sendTrialExpirationEmail.mockResolvedValue();

    await TrialScheduler.sendTrialExpirationNotices();

    expect(mockDb.query.mock.calls[0][0]).toContain('u.marketing_consent = true');
    expect(mockEmailService.sendTrialExpirationEmail).toHaveBeenCalledWith(
      user.email,
      user.username,
      0,
      user.id
    );
  });
});
