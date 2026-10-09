jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] })
}));

const db = require('../../src/config/database');
const refreshTokenService = require('../../src/services/refreshToken.service');
const jwt = require('jsonwebtoken');

describe('refreshTokenService.revokeDeviceTokens — IDOR protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('scopes the UPDATE by both device_id and user_id', async () => {
    const deviceId = 'device-abc';
    const userId = 'user-123';

    await refreshTokenService.revokeDeviceTokens(deviceId, userId);

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/WHERE device_id = \$1 AND user_id = \$2/);
    expect(params).toEqual([deviceId, userId, 'device_logout']);
  });

  test('throws when userId is missing so a caller cannot accidentally revoke any device', async () => {
    await expect(refreshTokenService.revokeDeviceTokens('device-abc'))
      .rejects.toThrow(/userId is required/);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('does not downgrade to a device-only query when userId is falsy', async () => {
    for (const badUserId of [null, undefined, '', 0, false]) {
      jest.clearAllMocks();
      await expect(refreshTokenService.revokeDeviceTokens('device-abc', badUserId))
        .rejects.toThrow(/userId is required/);
      expect(db.query).not.toHaveBeenCalled();
    }
  });
});

describe('refreshTokenService access token claims', () => {
  test('issues purpose-bound, session-versioned access tokens', () => {
    process.env.JWT_SECRET = 'refresh-token-test-secret';
    const token = refreshTokenService.generateAccessToken({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      role: 'user',
      session_version: 7
    });

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    expect(decoded).toEqual(expect.objectContaining({
      purpose: 'access',
      session_version: 7
    }));
  });

  test('rejects refresh tokens issued before the current session version', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-1',
          family_id: 'family-1',
          expires_at: new Date(Date.now() + 60000),
          is_active: true,
          token_session_version: 2,
          session_version: 3
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(refreshTokenService.refreshAccessToken('a'.repeat(80)))
      .rejects.toThrow('Invalid or expired refresh token');

    expect(db.query.mock.calls[1][0]).toMatch(/WHERE family_id = \$1/);
    expect(db.query.mock.calls[1][1]).toEqual(['family-1', 'session_revoked']);
  });
});
