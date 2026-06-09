const {
  buildAuthCookieOptions,
  buildCsrfCookieOptions
} = require('../../src/utils/authCookies');

describe('auth cookie options', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('marks localhost cookies Secure so SameSite=None is accepted over http://localhost', () => {
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
        secure: true,
        httpOnly: true
      })
    );
    expect(buildCsrfCookieOptions(req)).toEqual(
      expect.objectContaining({
        sameSite: 'none',
        secure: true,
        httpOnly: false
      })
    );
  });

  test('keeps SameSite=Lax for same-origin localhost requests, still marked Secure', () => {
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
        secure: true
      })
    );
  });

  test('non-localhost http dev requests stay non-Secure', () => {
    process.env.NODE_ENV = 'development';

    const req = {
      protocol: 'http',
      secure: false,
      headers: {
        origin: 'http://192.168.1.10:5173',
        host: '192.168.1.10:3030'
      },
      get(name) {
        return this.headers[name.toLowerCase()];
      }
    };

    expect(buildAuthCookieOptions(req)).toEqual(
      expect.objectContaining({
        sameSite: 'none',
        secure: false
      })
    );
  });

  test('non-localhost http production requests stay non-Secure so self-hosted browser sessions persist', () => {
    process.env.NODE_ENV = 'production';

    const req = {
      protocol: 'http',
      secure: false,
      headers: {
        origin: 'http://192.168.1.10:3030',
        host: '192.168.1.10:3030'
      },
      get(name) {
        return this.headers[name.toLowerCase()];
      }
    };

    expect(buildAuthCookieOptions(req)).toEqual(
      expect.objectContaining({
        sameSite: 'lax',
        secure: false,
        httpOnly: true
      })
    );
    expect(buildCsrfCookieOptions(req)).toEqual(
      expect.objectContaining({
        sameSite: 'lax',
        secure: false,
        httpOnly: false
      })
    );
  });

  test('https production requests still use Secure cookies', () => {
    process.env.NODE_ENV = 'production';

    const req = {
      protocol: 'http',
      secure: false,
      headers: {
        origin: 'https://tradetally.example.com',
        host: 'tradetally.example.com',
        'x-forwarded-proto': 'https,http'
      },
      get(name) {
        return this.headers[name.toLowerCase()];
      }
    };

    expect(buildAuthCookieOptions(req)).toEqual(
      expect.objectContaining({
        sameSite: 'lax',
        secure: true,
        httpOnly: true
      })
    );
  });
});
