const ApiKey = require('../models/ApiKey');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate requests using API keys
 * Can be used as an alternative to JWT authentication
 */
const apiKeyAuth = async (req, res, next) => {
  try {
    // Check for API key in headers
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Verify the API key
    const keyData = await ApiKey.verifyKey(apiKey);
    
    if (!keyData) {
      console.warn(`Invalid API key attempted: ${apiKey.substring(0, 8)}...`);
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Check if key is active and not expired
    if (!keyData.is_active) {
      return res.status(401).json({ error: 'API key is inactive' });
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.status(401).json({ error: 'API key has expired' });
    }

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
      permissions: keyData.permissions
    };

    // Log API usage for rate limiting and analytics
    console.log(`API key used: ${keyData.name} by ${keyData.username}`);

    next();
  } catch (error) {
    logger.logError('API key authentication error: ' + error.message);
    res.status(500).json({ error: 'Authentication service unavailable' });
  }
};

/**
 * Middleware to require specific API key permissions
 */
const requireApiPermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({ error: 'API key authentication required' });
    }

    if (!req.apiKey.permissions.includes(permission) && !req.apiKey.permissions.includes('admin')) {
      return res.status(403).json({ 
        error: `Insufficient permissions. Required: ${permission}`,
        permissions: req.apiKey.permissions
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
      if (token.startsWith('tt_live_')) {
        return apiKeyAuth(req, res, next);
      }
      
      // Otherwise, try JWT authentication
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (user && user.is_active) {
          req.user = user;
          return next();
        }
      } catch (jwtError) {
        // JWT failed, continue to API key check
      }
    }
    
    // Try API key authentication
    return apiKeyAuth(req, res, next);
    
  } catch (error) {
    logger.logError('Flexible authentication error: ' + error.message);
    res.status(500).json({ error: 'Authentication service unavailable' });
  }
};

module.exports = {
  apiKeyAuth,
  requireApiPermission,
  flexibleAuth
};