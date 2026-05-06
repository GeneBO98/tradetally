describe('unsubscribeService', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const unsubscribeService = require('../../src/services/unsubscribeService');

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-unsubscribe-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  test('generates and verifies tokens for UUID user IDs', () => {
    const userId = '7f4af2f4-64b0-4ffc-a834-4b2578402e3d';

    const token = unsubscribeService.generateToken(userId);

    expect(unsubscribeService.verifyToken(token)).toBe(userId);
  });

  test('keeps legacy numeric user ID tokens valid', () => {
    const token = unsubscribeService.generateToken(123);

    expect(unsubscribeService.verifyToken(token)).toBe('123');
  });

  test('rejects tampered tokens', () => {
    const token = unsubscribeService.generateToken('7f4af2f4-64b0-4ffc-a834-4b2578402e3d');
    const tamperedToken = token.replace(/\.[^.]+$/, '.invalid-signature');

    expect(unsubscribeService.verifyToken(tamperedToken)).toBeNull();
  });
});
