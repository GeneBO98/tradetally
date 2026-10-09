jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const oauth2Service = require('../../src/services/oauth2.service');
const originalVerifyToken = oauth2Service.verifyToken.bind(oauth2Service);
const originalHashToken = oauth2Service.hashToken.bind(oauth2Service);
const originalCreateAccessToken = oauth2Service.createAccessToken.bind(oauth2Service);

describe('oauth2 service security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    oauth2Service.verifyToken = originalVerifyToken;
    oauth2Service.hashToken = originalHashToken;
    oauth2Service.createAccessToken = originalCreateAccessToken;
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

  test('creates a refresh token from the inserted row id', async () => {
    const refreshId = '6d5d2c2c-8b1f-4f12-8c50-0f2975c66ddb';
    db.query.mockResolvedValueOnce({ rows: [{ id: refreshId }] });
    oauth2Service.hashToken = jest.fn().mockResolvedValue('hashed-refresh-token');

    const token = await oauth2Service.createRefreshToken({
      accessTokenId: 'access-id',
      clientId: 'client-uuid',
      userId: 'user-id',
      scopes: ['openid']
    });

    expect(token).toMatch(new RegExp(`^${refreshId}\\.`));
  });

  test('refreshes an opaque token with the internal client UUID, not the public client id', async () => {
    const refreshId = '6d5d2c2c-8b1f-4f12-8c50-0f2975c66ddb';
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: refreshId,
          token_hash: 'hashed-refresh-token',
          client_id: 'internal-client-uuid',
          public_client_id: 'public-client-id',
          user_id: 'user-id',
          scopes: ['openid']
        }]
      })
      .mockResolvedValueOnce({});
    oauth2Service.verifyToken = jest.fn().mockResolvedValue(true);
    oauth2Service.createAccessToken = jest.fn().mockResolvedValue({
      access_token: 'access-token',
      token_id: 'new-access-id'
    });

    await oauth2Service.refreshAccessToken(`${refreshId}.secret`, 'public-client-id');

    expect(db.query.mock.calls[0][0]).toContain('c.client_id AS public_client_id');
    expect(oauth2Service.createAccessToken).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'internal-client-uuid'
    }));
  });

  test('requires S256 PKCE when creating and consuming authorization codes', async () => {
    const verifier = 'a'.repeat(43);
    const challenge = oauth2Service.generateCodeChallenge(verifier);

    await expect(oauth2Service.createAuthorizationCode({
      clientId: 'client-id',
      userId: 'user-id',
      redirectUri: 'https://client.example/callback',
      scopes: ['openid']
    })).rejects.toThrow('PKCE S256');

    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'code-id',
        redirect_uri: 'https://client.example/callback',
        expires_at: new Date(Date.now() + 60_000),
        used_at: null,
        code_challenge: challenge,
        code_challenge_method: 'S256'
      }]
    }).mockResolvedValueOnce({});

    await expect(oauth2Service.verifyAuthorizationCode(
      'code',
      'client-id',
      'https://client.example/callback',
      verifier
    )).resolves.toEqual(expect.objectContaining({ id: 'code-id' }));
  });

  test('rejects legacy authorization codes without PKCE', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'legacy-code',
        redirect_uri: 'https://client.example/callback',
        expires_at: new Date(Date.now() + 60_000),
        used_at: null,
        code_challenge: null,
        code_challenge_method: null
      }]
    });

    await expect(oauth2Service.verifyAuthorizationCode(
      'code',
      'client-id',
      'https://client.example/callback',
      'a'.repeat(43)
    )).rejects.toThrow('Invalid authorization code');
  });
});
