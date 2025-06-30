const User = require('../../models/User');
const refreshTokenService = require('../../services/refreshToken.service');
const deviceService = require('../../services/device.service');
const crypto = require('crypto');

const authV1Controller = {
  /**
   * Enhanced registration with optional device info
   */
  async register(req, res, next) {
    try {
      const { email, username, password, fullName, deviceInfo } = req.body;

      // Validate required fields
      if (!email || !username || !password) {
        return res.status(400).json({ 
          error: 'Missing required fields: email, username, and password are required' 
        });
      }

      const existingEmail = await User.findByEmail(email);
      if (existingEmail) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const existingUsername = await User.findByUsername(username);
      if (existingUsername) {
        return res.status(409).json({ error: 'Username already taken' });
      }

      // Check if this is the first user (make them admin)
      const userCount = await User.getUserCount();
      const isFirstUser = userCount === 0;

      // Check if email verification is configured
      const emailConfigured = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
      
      let verificationToken = null;
      let verificationExpires = null;
      let isVerified = !emailConfigured; // Auto-verify if email not configured

      if (emailConfigured) {
        verificationToken = crypto.randomBytes(32).toString('hex');
        verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      }

      const user = await User.create({ 
        email, 
        username, 
        password, 
        fullName,
        verificationToken,
        verificationExpires,
        role: isFirstUser ? 'admin' : 'user',
        isVerified
      });
      
      await User.createSettings(user.id);

      // Register device if provided
      let device = null;
      if (deviceInfo) {
        try {
          device = await deviceService.registerDevice(user.id, deviceInfo);
        } catch (error) {
          console.warn('Failed to register device during registration:', error.message);
        }
      }

      // Generate tokens if user is verified or email not configured
      let tokens = null;
      if (isVerified) {
        const accessToken = refreshTokenService.generateAccessToken(user);
        const refreshTokenData = await refreshTokenService.generateRefreshToken(user.id, device?.id);
        
        tokens = {
          accessToken,
          refreshToken: refreshTokenData.token,
          expiresIn: refreshTokenService.getAccessTokenSeconds(),
          tokenType: 'Bearer'
        };
      }

      // TODO: Send verification email if needed (reuse existing logic)

      res.status(201).json({
        message: isVerified ? 'Registration successful' : 'Registration successful. Please verify your email.',
        requiresVerification: !isVerified,
        isFirstUser,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
          isVerified: user.is_verified
        },
        device,
        tokens
      });
    } catch (error) {
      console.error('V1 Registration error:', error);
      next(error);
    }
  },

  /**
   * Enhanced login with refresh tokens
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      const user = await User.findByEmail(email);
      const detailedErrors = process.env.DETAILED_AUTH_ERRORS === 'true' || 
                           !(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
      
      if (!user || !user.is_active) {
        return res.status(401).json({ 
          error: detailedErrors ? 'No account found with this email address' : 'Invalid credentials'
        });
      }

      const isValid = await User.verifyPassword(user, password);
      if (!isValid) {
        return res.status(401).json({ 
          error: detailedErrors ? 'Incorrect password' : 'Invalid credentials'
        });
      }

      // Check email verification
      const emailConfigured = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
      if (emailConfigured && !user.is_verified) {
        return res.status(403).json({ 
          error: 'Please verify your email before signing in',
          requiresVerification: true,
          email: user.email
        });
      }

      // Generate both access and refresh tokens
      const accessToken = refreshTokenService.generateAccessToken(user);
      const refreshTokenData = await refreshTokenService.generateRefreshToken(user.id);

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
          isVerified: user.is_verified
        },
        tokens: {
          accessToken,
          refreshToken: refreshTokenData.token,
          expiresIn: refreshTokenService.getAccessTokenSeconds(),
          tokenType: 'Bearer'
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Login with device registration
   */
  async loginWithDevice(req, res, next) {
    try {
      const { email, password, deviceInfo } = req.body;

      // First authenticate user
      const user = await User.findByEmail(email);
      const detailedErrors = process.env.DETAILED_AUTH_ERRORS === 'true' || 
                           !(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
      
      if (!user || !user.is_active) {
        return res.status(401).json({ 
          error: detailedErrors ? 'No account found with this email address' : 'Invalid credentials'
        });
      }

      const isValid = await User.verifyPassword(user, password);
      if (!isValid) {
        return res.status(401).json({ 
          error: detailedErrors ? 'Incorrect password' : 'Invalid credentials'
        });
      }

      // Check email verification
      const emailConfigured = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
      if (emailConfigured && !user.is_verified) {
        return res.status(403).json({ 
          error: 'Please verify your email before signing in',
          requiresVerification: true,
          email: user.email
        });
      }

      // Register or update device
      let device;
      try {
        // Check if device already exists by fingerprint
        const existingDevice = await deviceService.findDeviceByFingerprint(user.id, deviceInfo.fingerprint);
        
        if (existingDevice) {
          device = await deviceService.updateDeviceInfo(existingDevice.id, deviceInfo);
        } else {
          device = await deviceService.registerDevice(user.id, deviceInfo);
        }
      } catch (error) {
        console.error('Device registration failed:', error);
        return res.status(400).json({ error: 'Failed to register device' });
      }

      // Generate tokens with device association
      const accessToken = refreshTokenService.generateAccessToken(user);
      const refreshTokenData = await refreshTokenService.generateRefreshToken(user.id, device.id);

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
          isVerified: user.is_verified
        },
        device,
        tokens: {
          accessToken,
          refreshToken: refreshTokenData.token,
          expiresIn: refreshTokenService.getAccessTokenSeconds(),
          tokenType: 'Bearer'
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Refresh access token
   */
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const deviceId = req.headers['x-device-id'];

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token is required' });
      }

      if (!refreshTokenService.isValidRefreshTokenFormat(refreshToken)) {
        return res.status(400).json({ error: 'Invalid refresh token format' });
      }

      const result = await refreshTokenService.refreshAccessToken(refreshToken, deviceId);

      res.json({
        message: 'Token refreshed successfully',
        tokens: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
          tokenType: 'Bearer'
        },
        user: result.user
      });
    } catch (error) {
      if (error.message.includes('Invalid') || error.message.includes('expired')) {
        return res.status(401).json({ error: error.message });
      }
      next(error);
    }
  },

  /**
   * Enhanced logout with token revocation
   */
  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;
      
      if (refreshToken) {
        // Revoke the specific refresh token
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const db = require('../../config/database');
        const result = await db.query(
          'SELECT id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL',
          [tokenHash]
        );
        
        if (result.rows.length > 0) {
          await refreshTokenService.revokeRefreshToken(result.rows[0].id, 'logout');
        }
      }

      res.json({ message: 'Logout successful' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Logout from specific device
   */
  async logoutDevice(req, res, next) {
    try {
      const deviceId = req.headers['x-device-id'] || req.body.deviceId;
      
      if (!deviceId) {
        return res.status(400).json({ error: 'Device ID is required' });
      }

      await refreshTokenService.revokeDeviceTokens(deviceId, 'device_logout');
      
      res.json({ message: 'Device logout successful' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Logout from all devices
   */
  async logoutAllDevices(req, res, next) {
    try {
      await refreshTokenService.revokeUserTokens(req.user.id, 'logout_all');
      
      res.json({ message: 'Logged out from all devices' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get current session status
   */
  async getSessionStatus(req, res, next) {
    try {
      const tokens = await refreshTokenService.getUserTokens(req.user.id);
      
      res.json({
        activeTokens: tokens.length,
        tokens: tokens.map(token => ({
          id: token.id,
          deviceName: token.device_name,
          deviceType: token.device_type,
          createdAt: token.created_at,
          lastUsed: token.used_at || token.created_at,
          expiresAt: token.expires_at
        }))
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Extend current session
   */
  async extendSession(req, res, next) {
    try {
      // This could generate a new refresh token with extended expiry
      // For now, just return current session info
      res.json({ 
        message: 'Session extended',
        expiresIn: refreshTokenService.getAccessTokenSeconds()
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = authV1Controller;