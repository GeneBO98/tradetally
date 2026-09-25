const ApiKey = require('../models/ApiKey');
const logger = require('../utils/logger');
const { hasScope, resolveEffectiveScopes } = require('../utils/apiScopes');
const { isV1Request, sendV1Error } = require('../utils/apiResponse');
const { TOKEN_PURPOSES, verifyJwtToken, isTokenSessionValid, findActiveUserForAuth } = require('./auth');
const { AUTH_COOKIE_NAME } = require('../utils/authCookies');

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

/**
 * Resolve a raw API key to its request identity. Returns null when the key is
 * unknown, inactive, expired, or belongs to a deactivated user.
 *
 * The owner is loaded through the same cached lookup JWT auth uses, so
 * API-key requests see the full user row (timezone, tier, ...) and a
 * deactivated account's keys stop working immediately.
 */
async function resolveApiKeyIdentity(rawKey) {
  const keyData = await ApiKey.verifyKey(rawKey);
  if (!keyData) {
    return { error: 'INVALID_API_KEY' };
  }

  if (!keyData.is_active) {
    return { error: 'API_KEY_INACTIVE' };
  }

  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return { error: 'API_KEY_EXPIRED' };
  }

  const user = await findActiveUserForAuth(keyData.user_id);
  if (!user || !user.is_active) {
    return { error: 'API_KEY_OWNER_INACTIVE' };
  }

  return {
    user,
    apiKey: {
      id: keyData.id,
      name: keyData.name,
      permissions: keyData.permissions,
      scopes: keyData.scopes || [],
      effectiveScopes: resolveEffectiveScopes({
        permissions: keyData.permissions,
        scopes: keyData.scopes
      })
    }
  };
}

const API_KEY_ERROR_MESSAGES = {
  INVALID_API_KEY: 'Invalid API key',
  API_KEY_INACTIVE: 'API key is inactive',
  API_KEY_EXPIRED: 'API key has expired',
  API_KEY_OWNER_INACTIVE: 'API key owner account is inactive'
};

function attachApiKeyIdentity(req, identity) {
  req.user = identity.user;
  req.apiKey = identity.apiKey;
  req.authMethod = 'api_key';
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

    const identity = await resolveApiKeyIdentity(apiKey);
    if (identity.error) {
      if (identity.error === 'INVALID_API_KEY') {
        console.warn('Invalid API key attempted');
      }
      return sendAuthError(req, res, 401, identity.error, API_KEY_ERROR_MESSAGES[identity.error]);
    }

    attachApiKeyIdentity(req, identity);
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
        const user = await findActiveUserForAuth(decoded.id || decoded.userId);

        if (user && user.is_active && isTokenSessionValid(decoded, user)) {
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

    // Cookie-based JWT (browser sessions use HttpOnly cookie, no Authorization header)
    const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
    if (cookieToken) {
      try {
        const decoded = verifyJwtToken(cookieToken, { requiredPurpose: TOKEN_PURPOSES.ACCESS });
        const user = await findActiveUserForAuth(decoded.id || decoded.userId);
        if (user && user.is_active && isTokenSessionValid(decoded, user)) {
          req.user = user;
          req.authMethod = 'jwt';
          return next();
        }
        return sendAuthError(req, res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
      } catch (jwtError) {
        return sendAuthError(req, res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
      }
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
  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      if (token.startsWith('tt_live_') || token.startsWith('tt_test_')) {
        // API key in Bearer header — authenticate but don't fail hard
        try {
          const identity = await resolveApiKeyIdentity(token);
          if (!identity.error) attachApiKeyIdentity(req, identity);
        } catch (_) { /* fall through unauthenticated */ }
        return next();
      }

      // JWT token
      try {
        const decoded = verifyJwtToken(token, { requiredPurpose: TOKEN_PURPOSES.ACCESS });
        const user = await findActiveUserForAuth(decoded.id || decoded.userId);
        if (user && user.is_active && isTokenSessionValid(decoded, user)) {
          req.user = user;
          req.authMethod = 'jwt';
        }
      } catch (_) { /* fall through unauthenticated */ }
      return next();
    }

    if (apiKeyHeader) {
      try {
        const identity = await resolveApiKeyIdentity(apiKeyHeader);
        if (!identity.error) attachApiKeyIdentity(req, identity);
      } catch (_) { /* fall through unauthenticated */ }
      return next();
    }

    // Check for cookie-based JWT (same as optionalAuth)
    const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
    if (cookieToken) {
      try {
        const decoded = verifyJwtToken(cookieToken, { requiredPurpose: TOKEN_PURPOSES.ACCESS });
        const user = await findActiveUserForAuth(decoded.id || decoded.userId);
        if (user && user.is_active && isTokenSessionValid(decoded, user)) {
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
  flexibleOptionalAuth
};
