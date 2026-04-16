jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] })
}));

const db = require('../../src/config/database');
const refreshTokenService = require('../../src/services/refreshToken.service');

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
