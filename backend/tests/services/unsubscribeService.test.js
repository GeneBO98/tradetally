const service = require('../../src/services/unsubscribeService');

describe('unsubscribeService', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  test('round-trips numeric user ids', () => {
    const token = service.generateToken(123);
    expect(service.verifyToken(token)).toBe(123);
  });

  test('round-trips uuid user ids', () => {
    const userId = '28798975-67f9-4b40-9580-8199735d96aa';
    const token = service.generateToken(userId);
    expect(service.verifyToken(token)).toBe(userId);
  });

  test('accepts legacy numeric payload tokens', () => {
    const payload = Buffer.from('456').toString('base64url');
    const signature = require('crypto')
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(payload)
      .digest('base64url');

    expect(service.verifyToken(`${payload}.${signature}`)).toBe(456);
  });

  test('rejects tampered tokens', () => {
    const token = service.generateToken('28798975-67f9-4b40-9580-8199735d96aa');
    const tampered = `${token.slice(0, -1)}x`;
    expect(service.verifyToken(tampered)).toBeNull();
  });
});
