const oauth2Service = require('../services/oauth2.service');
const User = require('../models/User');

/**
 * Middleware to authenticate OAuth2 access tokens
 * This can be used alongside or instead of JWT authentication
 */
const authenticateOAuth2 = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Missing or invalid Authorization header'
      });
    }

    const token = authHeader.substring(7);

    // Verify access token
    const tokenData = await oauth2Service.verifyAccessToken(token);

    if (!tokenData) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Invalid or expired access token'
      });
    }

    // Get user data
    const user = await User.findById(tokenData.user_id);

    if (!user || !user.is_active) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'User not found or inactive'
      });
    }

    // Attach user and token info to request
    req.user = user;
    req.oauth = {
      client_id: tokenData.client_id,
      scopes: tokenData.scopes,
      token_id: tokenData.id
    };

    next();
  } catch (error) {
    console.error('OAuth2 authentication error:', error);
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error during authentication'
    });
  }
};

/**
 * Middleware to check if OAuth2 token has required scopes
 * Usage: requireScopes(['profile', 'email'])
 */
const requireScopes = (requiredScopes) => {
  return (req, res, next) => {
    if (!req.oauth || !req.oauth.scopes) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: 'OAuth2 token required'
      });
    }

    const hasAllScopes = requiredScopes.every(scope =>
      req.oauth.scopes.includes(scope)
    );

    if (!hasAllScopes) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `Required scopes: ${requiredScopes.join(', ')}`,
        required_scopes: requiredScopes
      });
    }

    next();
  };
};

/**
 * Middleware that accepts both JWT and OAuth2 tokens
 * Tries JWT first, falls back to OAuth2
 */
const authenticateFlexible = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Missing or invalid Authorization header'
      });
    }

    const token = authHeader.substring(7);

    // Try JWT authentication first
    const jwt = require('jsonwebtoken');
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (user && user.is_active) {
        req.user = user;
        req.token = token;
        req.authType = 'jwt';
        return next();
      }
    } catch (jwtError) {
      // JWT verification failed, try OAuth2
    }

    // Try OAuth2 authentication
    const tokenData = await oauth2Service.verifyAccessToken(token);

    if (tokenData) {
      const user = await User.findById(tokenData.user_id);

      if (user && user.is_active) {
        req.user = user;
        req.oauth = {
          client_id: tokenData.client_id,
          scopes: tokenData.scopes,
          token_id: tokenData.id
        };
        req.authType = 'oauth2';
        return next();
      }
    }

    // Both methods failed
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Invalid or expired token'
    });
  } catch (error) {
    console.error('Flexible authentication error:', error);
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error during authentication'
    });
  }
};

module.exports = {
  authenticateOAuth2,
  requireScopes,
  authenticateFlexible
};
