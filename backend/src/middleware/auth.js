const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isV1Request, sendV1Error } = require('../utils/apiResponse');
const { AUTH_COOKIE_NAME, clearAuthCookies } = require('../utils/authCookies');

const TOKEN_PURPOSES = Object.freeze({
  ACCESS: 'access',
  PRE_2FA: 'pre_2fa'
});

const authUserCache = new Map();
const pendingAuthUserLookups = new Map();

function getAuthUserCacheTtlMs() {
  const parsed = parseInt(process.env.AUTH_USER_CACHE_TTL_MS || '30000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function findActiveUserForAuth(userId) {
  const ttlMs = getAuthUserCacheTtlMs();
  const now = Date.now();
  const cached = ttlMs > 0 ? authUserCache.get(userId) : null;

  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  if (cached) {
    authUserCache.delete(userId);
  }

  if (pendingAuthUserLookups.has(userId)) {
    return pendingAuthUserLookups.get(userId);
  }

  const lookup = User.findById(userId)
    .then((user) => {
      if (user && user.is_active && ttlMs > 0) {
        authUserCache.set(userId, {
          user,
          expiresAt: Date.now() + ttlMs
        });
      } else {
        authUserCache.delete(userId);
      }
      return user;
    })
    .finally(() => {
      pendingAuthUserLookups.delete(userId);
    });

  pendingAuthUserLookups.set(userId, lookup);
  return lookup;
}

function clearAuthUserCache() {
  authUserCache.clear();
  pendingAuthUserLookups.clear();
}

class InvalidTokenPurposeError extends Error {
  constructor(expectedPurpose, actualPurpose) {
    super(`Invalid token purpose: expected ${expectedPurpose}, received ${actualPurpose || 'none'}`);
    this.name = 'InvalidTokenPurposeError';
    this.code = 'INVALID_TOKEN_PURPOSE';
  }
}

// Marks a genuine authentication failure (missing token, unknown/inactive user)
// as opposed to an unexpected error (e.g. a transient DB failure). Only genuine
// failures should produce a 401 — an infrastructure hiccup must NOT log the user
// out, or a valid session gets bounced to /login on a mere DB blip.
class UnauthenticatedError extends Error {
  constructor(message = 'Please authenticate') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

function verifyJwtToken(token, { requiredPurpose = TOKEN_PURPOSES.ACCESS } = {}) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  if (requiredPurpose && decoded.purpose !== requiredPurpose) {
    throw new InvalidTokenPurposeError(requiredPurpose, decoded.purpose);
  }

  return decoded;
}

function extractAccessToken(req) {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken) {
    return { token: cookieToken, source: 'cookie' };
  }

  const bearerToken = req.header('Authorization')?.replace('Bearer ', '').trim();
  if (bearerToken) {
    return { token: bearerToken, source: 'bearer' };
  }

  return { token: null, source: null };
}

const authenticate = async (req, res, next) => {
  try {
    const { token, source } = extractAccessToken(req);

    if (!token) {
      throw new UnauthenticatedError('No access token');
    }

    // Verify JWT token
    const decoded = verifyJwtToken(token, { requiredPurpose: TOKEN_PURPOSES.ACCESS });
    const user = await findActiveUserForAuth(decoded.id);

    if (!user || !user.is_active) {
      throw new UnauthenticatedError('User not found or inactive');
    }

    // Add device tracking headers to request
    req.user = user;
    req.token = token;
    req.authSource = source;
    req.deviceId = req.headers['x-device-id'];
    req.userAgent = req.headers['user-agent'];
    
    next();
  } catch (error) {
    // Genuine auth failures (bad/expired/missing token, unknown user) mean the
    // browser is carrying a useless auth cookie. Clear it on the response so
    // the next request goes through the anonymous path — otherwise the cookie
    // keeps triggering ensureCsrfCookie's reissue, the frontend keeps reading
    // a csrf hint as "session present", and unauth users get bounced into a
    // /login → /dashboard redirect loop. The 503 path below (transient errors)
    // deliberately skips this so a real session isn't logged out on a DB blip.
    const isCookieAuth = req.cookies?.[AUTH_COOKIE_NAME];

    if (error.name === 'TokenExpiredError') {
      if (isCookieAuth) clearAuthCookies(req, res);
      if (isV1Request(req)) {
        return sendV1Error(res, 401, 'TOKEN_EXPIRED', 'Access token has expired. Please refresh your token.');
      }

      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
        message: 'Access token has expired. Please refresh your token.'
      });
    } else if (error.name === 'JsonWebTokenError' || error.name === 'InvalidTokenPurposeError') {
      if (isCookieAuth) clearAuthCookies(req, res);
      if (isV1Request(req)) {
        return sendV1Error(res, 401, 'INVALID_TOKEN', 'Invalid token');
      }

      return res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    } else if (error instanceof UnauthenticatedError) {
      if (isCookieAuth) clearAuthCookies(req, res);
      if (isV1Request(req)) {
        return sendV1Error(res, 401, 'UNAUTHORIZED', 'Please authenticate');
      }

      return res.status(401).json({ error: 'Please authenticate' });
    }

    // Unexpected error (e.g. a transient DB failure from User.findById). This is
    // NOT an authentication failure — returning 401 would make the frontend
    // delete its session cookie and bounce a logged-in user to /login on a mere
    // backend hiccup. Surface it as a retryable 503 so the session is preserved.
    console.error('[AUTH] Unexpected error during authentication:', error);
    if (isV1Request(req)) {
      return sendV1Error(res, 503, 'AUTH_UNAVAILABLE', 'Authentication temporarily unavailable');
    }

    res.status(503).json({ error: 'Authentication temporarily unavailable', code: 'AUTH_UNAVAILABLE' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const { token, source } = extractAccessToken(req);

    if (token) {
      const decoded = verifyJwtToken(token, { requiredPurpose: TOKEN_PURPOSES.ACCESS });
      const user = await findActiveUserForAuth(decoded.id);

      if (user && user.is_active) {
        req.user = user;
        req.token = token;
        req.authSource = source;
      }
    }
    next();
  } catch (error) {
    next();
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    // First authenticate the user
    await new Promise((resolve, reject) => {
      authenticate(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Check if user has admin role
    if (!['admin', 'owner'].includes(req.user.role)) {
      if (isV1Request(req)) {
        return sendV1Error(res, 403, 'FORBIDDEN', 'Admin access required');
      }

      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    if (isV1Request(req)) {
      return sendV1Error(res, 401, 'UNAUTHORIZED', 'Please authenticate');
    }

    res.status(401).json({ error: 'Please authenticate' });
  }
};

const generateToken = (user, options = {}) => {
  const purpose = options.purpose || TOKEN_PURPOSES.ACCESS;
  const expiresIn = options.expiresIn || (purpose === TOKEN_PURPOSES.PRE_2FA ? '15m' : (process.env.JWT_EXPIRE || '7d'));

  return jwt.sign(
    { 
      id: user.id, 
      email: user.email,
      username: user.username,
      role: user.role,
      purpose
    },
    process.env.JWT_SECRET,
    { 
      expiresIn
    }
  );
};

module.exports = {
  TOKEN_PURPOSES,
  authenticate,
  extractAccessToken,
  optionalAuth,
  requireAdmin,
  generateToken,
  verifyJwtToken,
  clearAuthUserCache,
  findActiveUserForAuth
};
