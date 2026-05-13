jest.mock('../../src/services/emailService', () => ({
  isConfigured: jest.fn()
}));
jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/utils/jobQueue', () => ({
  addJob: jest.fn()
}));

const EmailService = require('../../src/services/emailService');
const db = require('../../src/config/database');
const jobQueue = require('../../src/utils/jobQueue');
const supportController = require('../../src/controllers/support.controller');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('support controller queueing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  test('submitContactRequest queues support email instead of sending inline', async () => {
    EmailService.isConfigured.mockReturnValue(true);
    db.query
      .mockResolvedValueOnce({
        rows: [{ email: 'user@example.com', username: 'trader', tier: 'pro' }]
      })
      .mockResolvedValueOnce({
        rows: [{ email: 'owner@example.com' }]
      });

    const req = {
      user: { id: 'user-1' },
      body: {
        subject: 'Need help',
        message: 'Please check my account'
      }
    };
    const res = createRes();
    const next = jest.fn();

    await supportController.submitContactRequest(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(jobQueue.addJob).toHaveBeenCalledWith(
      'support_request_email',
      {
        to: 'owner@example.com',
        userEmail: 'user@example.com',
        username: 'trader',
        tier: 'Pro',
        subject: 'Need help',
        message: 'Please check my account'
      },
      2,
      'user-1'
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Support request received successfully'
    });
  });
});
