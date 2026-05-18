const ApiKey = require('../models/ApiKey');
const logger = require('../utils/logger');
const { hasScope, resolveEffectiveScopes } = require('../utils/apiScopes');
const { isV1Request, sendV1Error } = require('../utils/apiResponse');
const { TOKEN_PURPOSES, verifyJwtToken } = require('./auth');

const apiKeyRateLimitBuckets = new Map();

function sendAuthError(req, res, status, code, message, extra = {}) {
  if (isV1Request(req)) {
    return sendV1Error(res, status, code, message, extra.details);
  }

  return res.status(status).json({
    error: message,
    code,
    ...extra
  });
}

function getApiKeyRateLimitConfig() {
  const windowMs = Number(process.env.API_KEY_RATE_LIMIT_WINDOW_MS || 60 * 1000);
  const max = Number(process.env.API_KEY_RATE_LIMIT_MAX || 600);
  return {
    enabled: process.env.API_KEY_RATE_LIMIT_ENABLED !== 'false',
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60 * 1000,
    max: Number.isFinite(max) && max > 0 ? max : 600
  };
}

function resetApiKeyRateLimitBuckets() {
  apiKeyRateLimitBuckets.clear();
}

function consumeApiKeyRateLimit(keyId, now = Date.now()) {
  const config = getApiKeyRateLimitConfig();
  if (!config.enabled || !keyId) {
    return { allowed: true, remaining: config.max, retryAfterSeconds: 0 };
  }

  const current = apiKeyRateLimitBuckets.get(keyId);
  if (!current || now >= current.resetAt) {
    const next = { count: 1, resetAt: now + config.windowMs };
    apiKeyRateLimitBuckets.set(keyId, next);
    return {
      allowed: true,
      remaining: Math.max(config.max - 1, 0),
      retryAfterSeconds: Math.ceil(config.windowMs / 1000)
    };
  }

  current.count += 1;
  const retryAfterSeconds = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
  return {
    allowed: current.count <= config.max,
    remaining: Math.max(config.max - current.count, 0),
    retryAfterSeconds
  };
}

/**
 * Middleware to authenticate requests using API keys
 * Can be used as an alternative to JWT authentication
 */
const apiKeyAuth = async (req, res, next) => {
  try {
    // Check for API key in headers
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      return sendAuthError(req, res, 401, 'API_KEY_REQUIRED', 'API key required');
    }

    // Verify the API key
    const keyData = await ApiKey.verifyKey(apiKey);
    
    if (!keyData) {
      console.warn('Invalid API key attempted');
      return sendAuthError(req, res, 401, 'INVALID_API_KEY', 'Invalid API key');
    }

    // Check if key is active and not expired
    if (!keyData.is_active) {
      return sendAuthError(req, res, 401, 'API_KEY_INACTIVE', 'API key is inactive');
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return sendAuthError(req, res, 401, 'API_KEY_EXPIRED', 'API key has expired');
    }

    const rateLimitResult = consumeApiKeyRateLimit(keyData.id);
    res.setHeader?.('X-Rate-Limit-Remaining', String(rateLimitResult.remaining));
    if (!rateLimitResult.allowed) {
      res.setHeader?.('Retry-After', String(rateLimitResult.retryAfterSeconds));
      return sendAuthError(req, res, 429, 'API_KEY_RATE_LIMITED', 'API key rate limit exceeded', {
        retryAfterSeconds: rateLimitResult.retryAfterSeconds
      });
    }

    const effectiveScopes = resolveEffectiveScopes({
      permissions: keyData.permissions,
      scopes: keyData.scopes
    });

    // Attach user and API key info to request
    req.user = {
      id: keyData.user_id,
      username: keyData.username,
      email: keyData.email,
      role: keyData.role
    };
    
    req.apiKey = {
      id: keyData.id,
      name: keyData.name,
      permissions: keyData.permissions,
      scopes: keyData.scopes || [],
      effectiveScopes
    };
    req.authMethod = 'api_key';

    // Log API usage for rate limiting and analytics
    console.log(`API key used: ${keyData.name} by ${keyData.username}`);

    next();
  } catch (error) {
    logger.logError('API key authentication error: ' + error.message);
    return sendAuthError(req, res, 500, 'AUTHENTICATION_ERROR', 'Authentication service unavailable');
  }
};

/**
 * Middleware to require specific API key permissions
 */
const requireApiPermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return sendAuthError(req, res, 401, 'API_KEY_REQUIRED', 'API key authentication required');
    }

    if (!req.apiKey.permissions.includes(permission) && !req.apiKey.permissions.includes('admin')) {
      return sendAuthError(req, res, 403, 'INSUFFICIENT_PERMISSIONS', `Insufficient permissions. Required: ${permission}`, {
        permissions: req.apiKey.permissions
      });
    }

    next();
  };
};

/**
 * Scope guard for API keys. JWT-authenticated requests bypass this check.
 */
const requireApiScope = (scope) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      // Request authenticated via JWT/session; preserve existing behavior.
      return next();
    }

    if (!hasScope(req.apiKey.effectiveScopes, scope)) {
      return sendAuthError(req, res, 403, 'INSUFFICIENT_SCOPE', `Missing required scope: ${scope}`, {
        requiredScope: scope,
        scopes: req.apiKey.effectiveScopes
      });
    }

    next();
  };
};

/**
 * Middleware that allows both JWT and API key authentication
 * Tries JWT first, then falls back to API key
 */
const flexibleAuth = async (req, res, next) => {
  // First try JWT authentication
  const User = require('../models/User');
  
  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];
    
    // Check if we have a Bearer token
    if (authHeader && authHeader.startsWith('Bearer ') && !apiKeyHeader) {
      const token = authHeader.substring(7);
      
      // If token starts with tt_live_, it's an API key, not a JWT
      if (token.startsWith('tt_live_') || token.startsWith('tt_test_')) {
        return apiKeyAuth(req, res, next);
      }
      
      // Otherwise, try JWT authentication
      try {
        const decoded = verifyJwtToken(token, { requiredPurpose: TOKEN_PURPOSES.ACCESS });
        const user = await User.findById(decoded.id || decoded.userId);
        
        if (user && user.is_active) {
          req.user = user;
          req.authMethod = 'jwt';
          return next();
        }
        // If user not found or inactive, return unauthorized
        return sendAuthError(req, res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
      } catch (jwtError) {
        // JWT failed, return unauthorized instead of trying API key
        return sendAuthError(req, res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
      }
    }
    
    // If we have an X-API-Key header, try API key authentication
    if (apiKeyHeader) {
      return apiKeyAuth(req, res, next);
    }
    
    // No valid authentication method found
    return sendAuthError(req, res, 401, 'UNAUTHORIZED', 'Authentication required');
    
  } catch (error) {
    logger.logError('Flexible authentication error: ' + error.message);
    return sendAuthError(req, res, 500, 'AUTHENTICATION_ERROR', 'Authentication service unavailable');
  }
};

/**
 * Like flexibleAuth but silently falls through when no auth is provided.
 * Supports JWT, API key, and unauthenticated access (for public trades).
 */
const flexibleOptionalAuth = async (req, res, next) => {
  const User = require('../models/User');

  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      if (token.startsWith('tt_live_') || token.startsWith('tt_test_')) {
        // API key in Bearer header — authenticate but don't fail hard
        try {
          const keyData = await ApiKey.verifyKey(token);
          if (keyData && keyData.is_active && (!keyData.expires_at || new Date(keyData.expires_at) >= new Date())) {
            const effectiveScopes = resolveEffectiveScopes({ permissions: keyData.permissions, scopes: keyData.scopes });
            req.user = { id: keyData.user_id, username: keyData.username, email: keyData.email, role: keyData.role };
            req.apiKey = { id: keyData.id, name: keyData.name, permissions: keyData.permissions, scopes: keyData.scopes || [], effectiveScopes };
            req.authMethod = 'api_key';
          }
        } catch (_) { /* fall through unauthenticated */ }
        return next();
      }

      // JWT token
      try {
        const decoded = verifyJwtToken(token, { requiredPurpose: TOKEN_PURPOSES.ACCESS });
        const user = await User.findById(decoded.id || decoded.userId);
        if (user && user.is_active) {
          req.user = user;
          req.authMethod = 'jwt';
        }
      } catch (_) { /* fall through unauthenticated */ }
      return next();
    }

    if (apiKeyHeader) {
      try {
        const keyData = await ApiKey.verifyKey(apiKeyHeader);
        if (keyData && keyData.is_active && (!keyData.expires_at || new Date(keyData.expires_at) >= new Date())) {
          const effectiveScopes = resolveEffectiveScopes({ permissions: keyData.permissions, scopes: keyData.scopes });
          req.user = { id: keyData.user_id, username: keyData.username, email: keyData.email, role: keyData.role };
          req.apiKey = { id: keyData.id, name: keyData.name, permissions: keyData.permissions, scopes: keyData.scopes || [], effectiveScopes };
          req.authMethod = 'api_key';
        }
      } catch (_) { /* fall through unauthenticated */ }
      return next();
    }

    // Check for cookie-based JWT (same as optionalAuth)
    if (req.cookies && req.cookies.token) {
      try {
        const decoded = verifyJwtToken(req.cookies.token, { requiredPurpose: TOKEN_PURPOSES.ACCESS });
        const user = await User.findById(decoded.id || decoded.userId);
        if (user && user.is_active) {
          req.user = user;
          req.authMethod = 'jwt';
        }
      } catch (_) { /* fall through unauthenticated */ }
    }

    next();
  } catch (error) {
    // Never fail — just proceed unauthenticated
    next();
  }
};

module.exports = {
  apiKeyAuth,
  requireApiPermission,
  requireApiScope,
  flexibleAuth,
  flexibleOptionalAuth,
  resetApiKeyRateLimitBuckets
};
