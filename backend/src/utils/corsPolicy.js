const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8080',
  'http://localhost:8081',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost'
];

function splitOrigins(value = '') {
  return value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function buildAllowedOrigins(env = process.env) {
  const origins = [
    env.FRONTEND_URL || 'http://localhost:5173',
    ...splitOrigins(env.CORS_ORIGINS || '')
  ];

  if (env.NODE_ENV !== 'production') {
    origins.push(...DEFAULT_DEV_ORIGINS);
  }

  return origins.map(origin => origin.trim()).filter(Boolean);
}

function isSameHostOrigin(origin, req) {
  try {
    const originUrl = new URL(origin);
    return originUrl.host === req.get('host');
  } catch (_) {
    return false;
  }
}

function isAllowedCorsOrigin(origin, req, allowedOriginSet) {
  if (!origin) {
    return true;
  }

  return allowedOriginSet.has(origin) || isSameHostOrigin(origin, req);
}

function buildCorsOptions(req, {
  allowedOriginSet,
  logger,
  onDenied
}) {
  return {
    origin: (origin, callback) => {
      logger?.debug?.(`CORS check for origin: ${origin || 'null'}`, 'cors');

      if (isAllowedCorsOrigin(origin, req, allowedOriginSet)) {
        if (origin) {
          logger?.debug?.(`Origin ${origin} is allowed`, 'cors');
        } else {
          logger?.debug?.('No origin header present - allowing request', 'cors');
        }
        callback(null, true);
        return;
      }

      logger?.warn?.(`Origin ${origin} not allowed. Allowed origins: ${Array.from(allowedOriginSet).join(', ')}`, 'cors');
      onDenied?.({ origin, path: req.originalUrl || req.url, host: req.get('host') });
      const error = new Error('Not allowed by CORS');
      error.status = 403;
      error.code = 'CORS_ORIGIN_DENIED';
      callback(error);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-API-Key', 'X-Auth-Token', 'X-Device-ID', 'X-App-Version', 'X-Platform', 'X-Request-ID', 'X-CSRF-Token'],
    exposedHeaders: ['X-API-Version', 'X-Rate-Limit-Remaining', 'X-Rate-Limit-Reset', 'X-Request-ID'],
    optionsSuccessStatus: 200
  };
}

module.exports = {
  DEFAULT_DEV_ORIGINS,
  buildAllowedOrigins,
  buildCorsOptions,
  isAllowedCorsOrigin,
  isSameHostOrigin
};
