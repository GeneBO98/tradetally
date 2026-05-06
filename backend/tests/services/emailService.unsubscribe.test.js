const mockDb = {
  query: jest.fn()
};

jest.mock('../../src/config/database', () => mockDb);

const emailService = require('../../src/services/emailService');
const unsubscribeService = require('../../src/services/unsubscribeService');

describe('emailService unsubscribe URLs', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-unsubscribe-secret';
    process.env.FRONTEND_URL = 'https://tradetally.io';
    process.env.API_BASE_URL = 'https://tradetally.io';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('uses the frontend route for visible unsubscribe links', () => {
    const userId = '7f4af2f4-64b0-4ffc-a834-4b2578402e3d';

    const url = emailService.getUnsubscribeUrl(userId);

    expect(url).toMatch(/^https:\/\/tradetally\.io\/unsubscribe\?token=/);
    const token = new URL(url).searchParams.get('token');
    expect(unsubscribeService.verifyToken(token)).toBe(userId);
  });

  test('uses the API route for one-click List-Unsubscribe headers', () => {
    const userId = '7f4af2f4-64b0-4ffc-a834-4b2578402e3d';

    const url = emailService.getOneClickUnsubscribeUrl(userId);

    expect(url).toMatch(/^https:\/\/tradetally\.io\/api\/unsubscribe\?token=/);
    const token = new URL(url).searchParams.get('token');
    expect(unsubscribeService.verifyToken(token)).toBe(userId);
  });

  test('does not duplicate /api when API_BASE_URL already includes it', () => {
    process.env.API_BASE_URL = 'https://tradetally.io/api';

    const url = emailService.getOneClickUnsubscribeUrl('user-1');

    expect(url).toMatch(/^https:\/\/tradetally\.io\/api\/unsubscribe\?token=/);
    expect(url).not.toContain('/api/api/');
  });
});
