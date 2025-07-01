const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw new Error();
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
        message: 'Access token has expired. Please refresh your token.'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    res.status(401).json({ error: 'Please authenticate' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate' });
  }
};

const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email,
      username: user.username,
      role: user.role
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRE || '7d' 
    }
  );
};

module.exports = { authenticate, optionalAuth, requireAdmin, generateToken };