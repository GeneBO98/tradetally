const db = require('../config/database');
const TierService = require('../services/tierService');
const { verifyJwtToken } = require('./auth');

const sseAuthenticate = async (req, res, next) => {
  try {
    // Check for token in query params (for SSE)
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify token
    const decoded = verifyJwtToken(token);
    
    // Get user from database
    const result = await db.query(
      'SELECT id, email, username, tier FROM users WHERE id = $1',
      [decoded.id]
    );
    
    if (result.rows.length === 0) {
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
    if (error.name === 'JsonWebTokenError' || error.name === 'InvalidTokenPurposeError') {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    
    console.error('SSE Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = { sseAuthenticate };
