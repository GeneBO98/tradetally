const {
  buildAuthCookieOptions,
  buildCsrfCookieOptions
} = require('../../src/utils/authCookies');

describe('auth cookie options', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('uses SameSite=None without forcing Secure for cross-origin local HTTP requests', () => {
    process.env.NODE_ENV = 'development';

    const req = {
      protocol: 'http',
      secure: false,
      headers: {
        origin: 'http://localhost:3030',
        host: '127.0.0.1:5001'
      },
      get(name) {
        return this.headers[name.toLowerCase()];
      }
    };

    expect(buildAuthCookieOptions(req)).toEqual(
      expect.objectContaining({
        sameSite: 'none',
        secure: false,
        httpOnly: true
      })
    );
    expect(buildCsrfCookieOptions(req)).toEqual(
      expect.objectContaining({
        sameSite: 'none',
        secure: false,
        httpOnly: false
      })
    );
  });

  test('keeps SameSite=Lax for same-origin requests', () => {
    process.env.NODE_ENV = 'development';

    const req = {
      protocol: 'http',
      secure: false,
      headers: {
        origin: 'http://localhost:3030',
        host: 'localhost:3030'
      },
      get(name) {
        return this.headers[name.toLowerCase()];
      }
    };

    expect(buildAuthCookieOptions(req)).toEqual(
      expect.objectContaining({
        sameSite: 'lax',
        secure: false
      })
    );
  });
});
