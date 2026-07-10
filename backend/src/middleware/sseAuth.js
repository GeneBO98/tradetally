const db = require('../config/database');
const TierService = require('../services/tierService');
const { AUTH_COOKIE_NAME } = require('../utils/authCookies');
const { TOKEN_PURPOSES, verifyJwtToken, isTokenSessionValid } = require('./auth');

const sseAuthenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.[AUTH_COOKIE_NAME];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = verifyJwtToken(token, { requiredPurpose: TOKEN_PURPOSES.ACCESS });
    
    // Get user from database
    const result = await db.query(
      'SELECT id, email, username, tier, is_active, session_version FROM users WHERE id = $1',
      [decoded.id]
    );
    
    if (result.rows.length === 0 || !result.rows[0].is_active || !isTokenSessionValid(decoded, result.rows[0])) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Get effective tier and billing status
    const effectiveTier = await TierService.getUserTier(decoded.id);
    const billingEnabled = await TierService.isBillingEnabled();
    
    // Attach user to request with effective tier
    req.user = {
      ...result.rows[0],
      tier: effectiveTier,
      billingEnabled: billingEnabled
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'InvalidTokenPurposeError') {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }
    
    console.error('SSE Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = { sseAuthenticate };
