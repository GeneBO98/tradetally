const User = require('../../models/User');
const refreshTokenService = require('../../services/refreshToken.service');
const deviceService = require('../../services/device.service');
const accountLockout = require('../../services/accountLockoutService');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const { generateToken, TOKEN_PURPOSES, verifyJwtToken, clearAuthUserCache } = require('../../middleware/auth');

function getRegistrationMode() {
  const mode = process.env.REGISTRATION_MODE || 'open';
  return ['disabled', 'approval', 'open'].includes(mode) ? mode : 'open';
}

function isEmailConfigured() {
  return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function getLoginPolicyFailure(user) {
  if (getRegistrationMode() === 'approval' && !user.admin_approved) {
    return {
      status: 403,
      body: {
        error: 'Your account is pending admin approval.',
        requiresApproval: true,
        email: user.email
      }
    };
  }

  if (isEmailConfigured() && !user.is_verified) {
    return {
      status: 403,
      body: {
        error: 'Please verify your email before signing in',
        requiresVerification: true,
        email: user.email
      }
    };
  }

  return null;
}

function buildTwoFactorChallenge(user) {
  return {
    requires2FA: true,
    tempToken: generateToken(user, {
      purpose: TOKEN_PURPOSES.PRE_2FA,
      expiresIn: '15m'
    }),
    message: 'Please provide your 2FA verification code'
  };
}

// Auto-generate a username from email, with random suffix if taken
async function generateUsername(email) {
  const base = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').substring(0, 20) || 'user';
  let username = base;
  let attempts = 0;
  while (attempts < 10) {
    const existing = await User.findByUsername(username);
    if (!existing) return username;
    username = `${base}${Math.floor(Math.random() * 9000) + 1000}`;
    attempts++;
  }
  return `${base}_${Date.now().toString(36)}`;
}

const authV1Controller = {
  /**
   * Enhanced registration with optional device info
   */
  async register(req, res, next) {
    try {
      const { email, username: providedUsername, password, fullName, deviceInfo } = req.body;

      const registrationMode = getRegistrationMode();
      if (registrationMode === 'disabled') {
        return res.status(403).json({
          error: 'User registration is currently disabled. Please contact an administrator.',
          registrationMode: 'disabled'
        });
      }

      // Validate required fields (only email and password required)
      if (!email || !password) {
        return res.status(400).json({
          error: 'Missing required fields: email and password are required'
        });
      }

      const existingEmail = await User.findByEmail(email);
      if (existingEmail) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Auto-generate username if not provided
      let username;
      if (providedUsername) {
        const existingUsername = await User.findByUsername(providedUsername);
        if (existingUsername) {
          return res.status(409).json({ error: 'Username already taken' });
        }
        username = providedUsername;
      } else {
        username = await generateUsername(email);
      }

      // Check if this is the first user (make them admin)
      const userCount = await User.getUserCount();
      const isFirstUser = userCount === 0;

      // Check if email verification is configured
      const emailConfigured = isEmailConfigured();
      
      let verificationToken = null;
      let verificationExpires = null;
      let isVerified = !emailConfigured || isFirstUser;
      const adminApproved = registrationMode !== 'approval' || isFirstUser;

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
        isVerified,
        adminApproved
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
      if (isVerified && adminApproved) {
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
        requiresApproval: !adminApproved,
        registrationMode,
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

      if (await accountLockout.isLocked(user)) {
        return res.status(423).json({ error: accountLockout.LOCKED_MESSAGE, accountLocked: true });
      }

      const isValid = await User.verifyPassword(user, password);
      if (!isValid) {
        const nowLocked = await accountLockout.recordFailedAttempt(user);
        if (nowLocked) {
          return res.status(423).json({ error: accountLockout.LOCKED_MESSAGE, accountLocked: true });
        }
        return res.status(401).json({
          error: detailedErrors ? 'Incorrect password' : 'Invalid credentials'
        });
      }

      await accountLockout.recordSuccess(user);

      const policyFailure = getLoginPolicyFailure(user);
      if (policyFailure) {
        return res.status(policyFailure.status).json(policyFailure.body);
      }

      if (user.two_factor_enabled) {
        return res.json(buildTwoFactorChallenge(user));
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

      if (await accountLockout.isLocked(user)) {
        return res.status(423).json({ error: accountLockout.LOCKED_MESSAGE, accountLocked: true });
      }

      const isValid = await User.verifyPassword(user, password);
      if (!isValid) {
        const nowLocked = await accountLockout.recordFailedAttempt(user);
        if (nowLocked) {
          return res.status(423).json({ error: accountLockout.LOCKED_MESSAGE, accountLocked: true });
        }
        return res.status(401).json({
          error: detailedErrors ? 'Incorrect password' : 'Invalid credentials'
        });
      }

      await accountLockout.recordSuccess(user);

      const policyFailure = getLoginPolicyFailure(user);
      if (policyFailure) {
        return res.status(policyFailure.status).json(policyFailure.body);
      }

      if (user.two_factor_enabled) {
        return res.json(buildTwoFactorChallenge(user));
      }

      // Register or update device
      let device;
      try {
        // Check if device already exists by fingerprint
        const existingDevice = await deviceService.findDeviceByFingerprint(user.id, deviceInfo.fingerprint);
        
        if (existingDevice) {
          device = await deviceService.updateDeviceInfo(existingDevice.id, user.id, deviceInfo);
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

  async verify2FA(req, res, next) {
    try {
      const tempToken = String(req.body.tempToken || req.body.temp_token || req.body.token || '').trim();
      const twoFactorCode = String(req.body.twoFactorCode || req.body.two_factor_code || req.body.code || '').trim();

      if (!tempToken || !twoFactorCode) {
        return res.status(400).json({ error: 'Temporary token and 2FA code are required' });
      }

      let decoded;
      try {
        decoded = verifyJwtToken(tempToken, { requiredPurpose: TOKEN_PURPOSES.PRE_2FA });
      } catch (_) {
        return res.status(401).json({ error: 'Invalid or expired temporary token' });
      }

      const user = await User.findById(decoded.id);
      if (!user || !user.is_active || !user.two_factor_enabled ||
          decoded.session_version !== Number(user.session_version || 0)) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      const policyFailure = getLoginPolicyFailure(user);
      if (policyFailure) {
        return res.status(policyFailure.status).json(policyFailure.body);
      }

      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 2
      });

      if (!verified) {
        const backupCodes = user.two_factor_backup_codes || [];
        const normalizedCode = twoFactorCode.toUpperCase();
        if (!backupCodes.includes(normalizedCode)) {
          return res.status(400).json({ error: 'Invalid 2FA code' });
        }
        await User.updateBackupCodes(user.id, backupCodes.filter(code => code !== normalizedCode));
      }

      const accessToken = refreshTokenService.generateAccessToken(user);
      const refreshTokenData = await refreshTokenService.generateRefreshToken(user.id);
      await User.updateLastLogin(user.id);

      return res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
          isVerified: user.is_verified,
          twoFactorEnabled: true
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
          'SELECT id FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL',
          [tokenHash, req.user.id]
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

      await refreshTokenService.revokeDeviceTokens(deviceId, req.user.id, 'device_logout');

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
      await User.revokeSessions(req.user.id);
      clearAuthUserCache(req.user.id);
      
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
