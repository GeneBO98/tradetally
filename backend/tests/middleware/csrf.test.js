const {
  CSRF_HEADER_NAME,
  ensureCsrfCookie,
  requireCsrf
} = require('../../src/middleware/csrf');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    cookie: jest.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
}

describe('csrf middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('ensureCsrfCookie issues csrf cookie when auth cookie exists without csrf cookie', () => {
    const req = {
      protocol: 'http',
      get: jest.fn(() => 'localhost:3030'),
      headers: {},
      cookies: {
        token: 'auth-cookie'
      }
    };
    const res = createRes();
    const next = jest.fn();

    ensureCsrfCookie(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith(
      'csrf_token',
      expect.any(String),
      expect.objectContaining({
        sameSite: 'lax',
        httpOnly: false
      })
    );
  });

  test('requireCsrf rejects cookie-authenticated unsafe requests with mismatched token', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/users/profile',
      cookies: {
        token: 'auth-cookie',
        csrf_token: 'cookie-token'
      },
      headers: {
        [CSRF_HEADER_NAME]: 'header-token'
      },
      header: jest.fn(() => undefined)
    };
    const res = createRes();
    const next = jest.fn();

    requireCsrf(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.payload).toEqual({
      error: 'Invalid CSRF token',
      code: 'INVALID_CSRF_TOKEN'
    });
  });

  test('requireCsrf allows bearer-authenticated requests without csrf token', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/users/profile',
      cookies: {},
      headers: {},
      header: jest.fn(() => 'Bearer token-123')
    };
    const res = createRes();
    const next = jest.fn();

    requireCsrf(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  test('requireCsrf allows mobile clients with stale auth cookie but no csrf header', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/auth/login',
      cookies: {
        token: 'stale-cookie',
        csrf_token: 'stale-csrf'
      },
      headers: {
        'x-device-id': 'device-123'
      },
      header: jest.fn(() => undefined)
    };
    const res = createRes();
    const next = jest.fn();

    requireCsrf(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  test('requireCsrf exempts verify-2fa even with a stale auth cookie and mismatched csrf token', () => {
    // Pre-auth 2FA completion: a lingering auth cookie from a prior session
    // would otherwise trigger CSRF enforcement, but the login flow never
    // established a matching csrf_token for the client to send.
    const req = {
      method: 'POST',
      originalUrl: '/api/auth/verify-2fa',
      cookies: {
        token: 'stale-cookie',
        csrf_token: 'stale-csrf'
      },
      headers: {
        [CSRF_HEADER_NAME]: 'different-or-missing'
      },
      header: jest.fn(() => undefined)
    };
    const res = createRes();
    const next = jest.fn();

    requireCsrf(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  test('requireCsrf exempts stripe webhook path', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/billing/webhooks/stripe',
      cookies: {
        token: 'auth-cookie'
      },
      headers: {},
      header: jest.fn(() => undefined)
    };
    const res = createRes();
    const next = jest.fn();

    requireCsrf(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
