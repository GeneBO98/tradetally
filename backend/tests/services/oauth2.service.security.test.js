jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const oauth2Service = require('../../src/services/oauth2.service');
const originalVerifyToken = oauth2Service.verifyToken.bind(oauth2Service);

describe('oauth2 service token revocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    oauth2Service.verifyToken = originalVerifyToken;
  });

  test('revokeToken only revokes the matching access token and linked refresh tokens', async () => {
    const tokenId = '6d5d2c2c-8b1f-4f12-8c50-0f2975c66ddb';

    db.query
      .mockResolvedValueOnce({ rows: [{ id: tokenId, token_hash: 'hashed-access-token' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    oauth2Service.verifyToken = jest.fn().mockResolvedValue(true);

    const result = await oauth2Service.revokeToken(`${tokenId}.secret`, 'client-123');

    expect(result).toBe(true);
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('FROM oauth_access_tokens'), [tokenId, 'client-123']);
    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE oauth_access_tokens SET revoked_at = NOW()'), [tokenId]);
    expect(db.query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE oauth_refresh_tokens SET revoked_at = NOW()'), [tokenId]);
  });
});
