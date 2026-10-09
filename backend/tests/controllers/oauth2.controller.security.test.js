jest.mock('../../src/services/oauth2.service', () => ({
  getClient: jest.fn(),
  validateRedirectUri: jest.fn(),
  validateScopes: jest.fn(),
  isValidCodeChallenge: jest.fn(),
  verifyClientCredentials: jest.fn(),
  refreshAccessToken: jest.fn()
}));

const oauth2Service = require('../../src/services/oauth2.service');
const controller = require('../../src/controllers/oauth2.controller');

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
    redirect: jest.fn()
  };
}

describe('OAuth2 controller security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires an S256 challenge on authorization requests', async () => {
    oauth2Service.getClient.mockResolvedValue({
      id: 'client-uuid',
      name: 'Client',
      redirect_uris: ['https://client.example/callback'],
      allowed_scopes: ['openid']
    });
    oauth2Service.validateRedirectUri.mockReturnValue(true);
    oauth2Service.isValidCodeChallenge.mockReturnValue(false);
    const req = {
      query: {
        response_type: 'code',
        client_id: 'public-client-id',
        redirect_uri: 'https://client.example/callback',
        scope: 'openid'
      },
      headers: {},
      originalUrl: '/oauth/authorize'
    };
    const res = response();

    await controller.authorize(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual(expect.objectContaining({ error: 'invalid_request' }));
  });

  test('does not expose refresh-token failure details', async () => {
    oauth2Service.verifyClientCredentials.mockResolvedValue({ id: 'client-uuid', name: 'Client' });
    oauth2Service.refreshAccessToken.mockRejectedValue(
      new Error('column reference "client_id" is ambiguous at character 123')
    );
    const req = {
      body: {
        grant_type: 'refresh_token',
        refresh_token: 'refresh-token',
        client_id: 'public-client-id',
        client_secret: 'client-secret'
      },
      headers: {}
    };
    const res = response();

    await controller.token(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: 'invalid_grant' });
  });

  test('advertises only S256 in discovery metadata', async () => {
    const req = {
      get: jest.fn(name => name === 'host' ? 'tradetally.example' : undefined),
      protocol: 'https'
    };
    const res = response();

    await controller.openidConfiguration(req, res);

    expect(res.payload.code_challenge_methods_supported).toEqual(['S256']);
  });
});
