const jwt = require('jsonwebtoken');
const {
  generateToken,
  JWT_ALGORITHM,
  TOKEN_PURPOSES,
  verifyJwtToken
} = require('../../src/middleware/auth');
const refreshTokenService = require('../../src/services/refreshToken.service');

describe('JWT signing and verification policy', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-with-enough-length';
  });

  test('generateToken signs access tokens with the pinned algorithm and purpose', () => {
    const token = generateToken({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      role: 'user'
    });

    const decoded = jwt.decode(token, { complete: true });
    expect(decoded.header.alg).toBe(JWT_ALGORITHM);
    expect(decoded.payload.purpose).toBe(TOKEN_PURPOSES.ACCESS);
  });

  test('verifyJwtToken rejects tokens signed with a different HMAC algorithm', () => {
    const token = jwt.sign({
      id: 'user-1',
      purpose: TOKEN_PURPOSES.ACCESS
    }, process.env.JWT_SECRET, {
      algorithm: 'HS384'
    });

    expect(() => verifyJwtToken(token)).toThrow(/invalid algorithm/i);
  });

  test('refresh-token access tokens match the main access-token contract', () => {
    const token = refreshTokenService.generateAccessToken({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      role: 'user'
    });

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM]
    });

    expect(decoded.purpose).toBe(TOKEN_PURPOSES.ACCESS);
    expect(decoded.id).toBe('user-1');
  });
});
