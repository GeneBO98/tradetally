const ApiKey = require('../models/ApiKey');
const logger = require('../utils/logger');
const { hasScope, resolveEffectiveScopes } = require('../utils/apiScopes');
const { isV1Request, sendV1Error } = require('../utils/apiResponse');

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
      console.warn(`Invalid API key attempted: ${apiKey.substring(0, 8)}...`);
      return sendAuthError(req, res, 401, 'INVALID_API_KEY', 'Invalid API key');
    }

    // Check if key is active and not expired
    if (!keyData.is_active) {
      return sendAuthError(req, res, 401, 'API_KEY_INACTIVE', 'API key is inactive');
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return sendAuthError(req, res, 401, 'API_KEY_EXPIRED', 'API key has expired');
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
  const jwt = require('jsonwebtoken');
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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

module.exports = {
  apiKeyAuth,
  requireApiPermission,
  requireApiScope,
  flexibleAuth
};
