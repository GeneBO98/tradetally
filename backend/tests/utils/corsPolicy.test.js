const {
  buildAllowedOrigins,
  buildCorsOptions,
  isAllowedCorsOrigin,
  isSameHostOrigin
} = require('../../src/utils/corsPolicy');

function createReq(host = '127.0.0.1:3001') {
  return {
    originalUrl: '/api/health',
    url: '/api/health',
    get: jest.fn((name) => (name.toLowerCase() === 'host' ? host : undefined))
  };
}

function resolveOrigin(corsOptions, origin) {
  return new Promise((resolve) => {
    corsOptions.origin(origin, (error, allowed) => resolve({ error, allowed }));
  });
}

describe('corsPolicy', () => {
  test('production allowed origins use configured frontend and CORS_ORIGINS only', () => {
    const origins = buildAllowedOrigins({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://app.tradetally.example',
      CORS_ORIGINS: 'https://admin.tradetally.example, https://reports.tradetally.example'
    });

    expect(origins).toEqual([
      'https://app.tradetally.example',
      'https://admin.tradetally.example',
      'https://reports.tradetally.example'
    ]);
    expect(origins).not.toContain('http://localhost:5173');
  });

  test('same-host self-hosted origin is accepted even when not explicitly configured', () => {
    const req = createReq('127.0.0.1:3001');

    expect(isSameHostOrigin('http://127.0.0.1:3001', req)).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1:3001', req, new Set())).toBe(true);
  });

  test('missing origin is accepted for non-browser callers', () => {
    const req = createReq();
    const corsOptions = buildCorsOptions(req, {
      allowedOriginSet: new Set(['https://app.tradetally.example']),
      logger: { debug: jest.fn(), warn: jest.fn() }
    });

    return expect(resolveOrigin(corsOptions, undefined)).resolves.toEqual({
      error: null,
      allowed: true
    });
  });

  test('hostile origin is denied and reported', async () => {
    const req = createReq();
    const onDenied = jest.fn();
    const corsOptions = buildCorsOptions(req, {
      allowedOriginSet: new Set(['https://app.tradetally.example']),
      logger: { debug: jest.fn(), warn: jest.fn() },
      onDenied
    });

    const result = await resolveOrigin(corsOptions, 'https://evil.example');

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('Not allowed by CORS');
    expect(result.allowed).toBeUndefined();
    expect(onDenied).toHaveBeenCalledWith({
      origin: 'https://evil.example',
      path: '/api/health',
      host: '127.0.0.1:3001'
    });
  });
});
