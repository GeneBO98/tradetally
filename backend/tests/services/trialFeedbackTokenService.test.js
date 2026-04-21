describe('trialFeedbackTokenService', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('generates and verifies a valid token for a UUID user id', () => {
    const service = require('../../src/services/trialFeedbackTokenService');
    const userId = '9f48ce5b-58bf-421a-b4f2-4f4f6d04a5b0';

    const token = service.generateToken(userId);

    expect(service.verifyToken(token)).toBe(userId);
  });

  it('rejects a tampered token', () => {
    const service = require('../../src/services/trialFeedbackTokenService');
    const token = service.generateToken('9f48ce5b-58bf-421a-b4f2-4f4f6d04a5b0');
    const tampered = `${token}tampered`;

    expect(service.verifyToken(tampered)).toBeNull();
  });
});
