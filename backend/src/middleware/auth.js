const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isV1Request, sendV1Error } = require('../utils/apiResponse');

const TOKEN_PURPOSES = Object.freeze({
  ACCESS: 'access',
  PRE_2FA: 'pre_2fa'
});

class InvalidTokenPurposeError extends Error {
  constructor(expectedPurpose, actualPurpose) {
    super(`Invalid token purpose: expected ${expectedPurpose}, received ${actualPurpose || 'none'}`);
    this.name = 'InvalidTokenPurposeError';
    this.code = 'INVALID_TOKEN_PURPOSE';
  }
}

function verifyJwtToken(token, { requiredPurpose = TOKEN_PURPOSES.ACCESS } = {}) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  if (requiredPurpose && decoded.purpose !== requiredPurpose) {
    throw new InvalidTokenPurposeError(requiredPurpose, decoded.purpose);
  }

  return decoded;
}

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw new Error();
    }

    // Verify JWT token
    const decoded = verifyJwtToken(token, { requiredPurpose: TOKEN_PURPOSES.ACCESS });
    const user = await User.findById(decoded.id);

    if (!user || !user.is_active) {
      throw new Error();
    }

    // Add device tracking headers to request
    req.user = user;
    req.token = token;
    req.deviceId = req.headers['x-device-id'];
    req.userAgent = req.headers['user-agent'];
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      if (isV1Request(req)) {
        return sendV1Error(res, 401, 'TOKEN_EXPIRED', 'Access token has expired. Please refresh your token.');
      }

      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
        message: 'Access token has expired. Please refresh your token.'
      });
    } else if (error.name === 'JsonWebTokenError' || error.name === 'InvalidTokenPurposeError') {
      if (isV1Request(req)) {
        return sendV1Error(res, 401, 'INVALID_TOKEN', 'Invalid token');
      }

      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    if (isV1Request(req)) {
      return sendV1Error(res, 401, 'UNAUTHORIZED', 'Please authenticate');
    }
    
    res.status(401).json({ error: 'Please authenticate' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    // Try to get token from Authorization header first
    let token = req.header('Authorization')?.replace('Bearer ', '');

    // If no Authorization header, try to get token from cookie
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      const decoded = verifyJwtToken(token, { requiredPurpose: TOKEN_PURPOSES.ACCESS });
      const user = await User.findById(decoded.id);

      if (user && user.is_active) {
        req.user = user;
        req.token = token;
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
    if (req.user.role !== 'admin') {
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
  optionalAuth,
  requireAdmin,
  generateToken,
  verifyJwtToken
};
