const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const crypto = require('crypto');
const EmailService = require('../services/emailService');
const bcrypt = require('bcryptjs');
const TierService = require('../services/tierService');

// Check if email configuration is available
function isEmailConfigured() {
  return EmailService.isConfigured();
}

// Check if detailed error messages are enabled (for self-hosted setups)
function useDetailedErrors() {
  return process.env.DETAILED_AUTH_ERRORS === 'true' || !isEmailConfigured();
}

// Get registration mode from environment
function getRegistrationMode() {
  const mode = process.env.REGISTRATION_MODE || 'open';
  const validModes = ['disabled', 'approval', 'open'];
  return validModes.includes(mode) ? mode : 'open';
}

// Get billing enabled from environment (defaults to false)
function getBillingEnabled() {
  return process.env.BILLING_ENABLED === 'true';
}

const authController = {
  async register(req, res, next) {
    try {
      console.log('Registration request body:', req.body);
      const { email, username, password, fullName } = req.body;

      // Check registration mode
      const registrationMode = getRegistrationMode();
      if (registrationMode === 'disabled') {
        return res.status(403).json({ 
          error: 'User registration is currently disabled. Please contact an administrator.',
          registrationMode: 'disabled'
        });
      }

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
      const emailConfigured = isEmailConfigured();
      
      let verificationToken = null;
      let verificationExpires = null;
      let isVerified = !emailConfigured || isFirstUser; // Auto-verify if email not configured OR if first user
      let adminApproved = true; // Default to approved

      // Set admin approval based on registration mode
      if (registrationMode === 'approval' && !isFirstUser) {
        adminApproved = false; // Require admin approval for non-first users
      }

      if (emailConfigured && !isFirstUser) {
        // Generate verification token only if email is configured AND not first user
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

      // Log if this user was made an admin
      if (isFirstUser) {
        console.log(`🔐 First user registered - automatically granted admin privileges: ${user.username} (${user.email})`);
      }

      // Send verification email only if email is configured AND not first user
      if (emailConfigured && !isFirstUser) {
        try {
          await sendVerificationEmail(email, verificationToken);
        } catch (error) {
          console.warn('[WARNING] Failed to send verification email (continuing with registration):', error.message);
        }
      } else {
        console.log(`[INFO] Email verification skipped - no email configuration found for user: ${user.username}`);
      }

      // Determine response message
      let message;
      if (isFirstUser && emailConfigured) {
        message = 'Registration successful. As the first user, you have been granted admin privileges. Please check your email to verify your account.';
      } else if (isFirstUser && !emailConfigured) {
        message = 'Registration successful. As the first user, you have been granted admin privileges. Your account is ready to use.';
      } else if (registrationMode === 'approval' && !adminApproved) {
        message = emailConfigured 
          ? 'Registration successful. Please check your email to verify your account, and wait for admin approval before you can sign in.'
          : 'Registration successful. Please wait for admin approval before you can sign in.';
      } else if (!isFirstUser && emailConfigured) {
        message = 'Registration successful. Please check your email to verify your account.';
      } else {
        message = 'Registration successful. Your account is ready to use.';
      }

      res.status(201).json({
        message,
        requiresVerification: emailConfigured,
        requiresApproval: !adminApproved,
        registrationMode,
        isFirstUser,
        emailConfigured,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
          isVerified: user.is_verified,
          adminApproved: user.admin_approved
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      next(error);
    }
  },

  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      const user = await User.findByEmail(email);
      const detailedErrors = useDetailedErrors();
      
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

      // Check if email is verified (only if email verification is configured)
      const emailConfigured = isEmailConfigured();
      if (emailConfigured && !user.is_verified) {
        return res.status(403).json({ 
          error: 'Please verify your email before signing in',
          requiresVerification: true,
          email: user.email
        });
      }

      // Check if user is approved by admin (if approval mode is enabled)
      const registrationMode = getRegistrationMode();
      if (registrationMode === 'approval' && !user.admin_approved) {
        return res.status(403).json({ 
          error: 'Your account is pending admin approval. Please wait for an administrator to approve your registration.',
          requiresApproval: true,
          email: user.email
        });
      }

      // Check if 2FA is enabled for this user
      if (user.two_factor_enabled) {
        // Generate a temporary token for 2FA verification
        const tempToken = generateToken(user, '15m'); // Short-lived token
        return res.json({
          requires2FA: true,
          tempToken: tempToken,
          message: 'Please provide your 2FA verification code'
        });
      }

      const token = generateToken(user);

      // Set HTTP-only cookie for OAuth flow
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Get user tier and billing status for response
      const TierService = require('../services/tierService');
      const userTier = await TierService.getUserTier(user.id);
      const billingEnabled = await TierService.isBillingEnabled();

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
          tier: userTier,
          billingEnabled: billingEnabled,
          isVerified: user.is_verified,
          adminApproved: user.admin_approved,
          twoFactorEnabled: user.two_factor_enabled || false
        },
        token
      });
    } catch (error) {
      next(error);
    }
  },

  async verify2FA(req, res, next) {
    try {
      const { tempToken, twoFactorCode } = req.body;

      if (!tempToken || !twoFactorCode) {
        return res.status(400).json({ error: 'Temporary token and 2FA code are required' });
      }

      // Verify the temporary token
      const jwt = require('jsonwebtoken');
      const speakeasy = require('speakeasy');
      
      let decoded;
      try {
        decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
      } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired temporary token' });
      }

      const user = await User.findByEmail(decoded.email);
      if (!user || !user.two_factor_enabled) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      // Verify 2FA code
      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 2
      });

      if (!verified) {
        // Check if it's a backup code
        const backupCodes = user.two_factor_backup_codes || [];
        if (backupCodes.includes(twoFactorCode.toUpperCase())) {
          // Remove used backup code
          const updatedBackupCodes = backupCodes.filter(code => code !== twoFactorCode.toUpperCase());
          await User.updateBackupCodes(user.id, updatedBackupCodes);
        } else {
          return res.status(400).json({ error: 'Invalid 2FA code' });
        }
      }

      // Generate full access token
      const token = generateToken(user);
      
      // Get tier and billing status
      const TierService = require('../services/tierService');
      const userTier = await TierService.getUserTier(user.id);
      const billingEnabled = await TierService.isBillingEnabled();

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
          tier: userTier,
          billingEnabled: billingEnabled,
          timezone: user.timezone,
          isVerified: user.is_verified,
          adminApproved: user.admin_approved,
          twoFactorEnabled: user.two_factor_enabled
        },
        token
      });
    } catch (error) {
      next(error);
    }
  },

  async logout(req, res, next) {
    try {
      // Clear the HTTP-only cookie
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });

      res.json({ message: 'Logout successful' });
    } catch (error) {
      next(error);
    }
  },

  async getMe(req, res, next) {
    try {
      const user = await User.findById(req.user.id);
      const settings = await User.getSettings(req.user.id);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
          tier: req.user.tier, // Use effective tier from middleware
          isVerified: user.is_verified,
          adminApproved: user.admin_approved,
          timezone: user.timezone,
          createdAt: user.created_at,
          billingEnabled: req.user.billingEnabled
        },
        settings
      });
    } catch (error) {
      next(error);
    }
  },

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      
      res.status(501).json({ error: 'Refresh token not implemented' });
    } catch (error) {
      next(error);
    }
  },

  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;

      const user = await User.findByEmail(email);
      if (!user) {
        return res.json({ message: 'If the email exists, a reset link has been sent' });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await User.updateResetToken(user.id, resetToken, resetExpires);
      await sendPasswordResetEmail(email, resetToken);

      res.json({ message: 'If the email exists, a reset link has been sent' });
    } catch (error) {
      next(error);
    }
  },

  async resetPassword(req, res, next) {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ error: 'Token and password are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      const user = await User.findByResetToken(token);
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await User.updatePassword(user.id, hashedPassword);

      res.json({ message: 'Password has been reset successfully' });
    } catch (error) {
      next(error);
    }
  },

  async verifyEmail(req, res, next) {
    try {
      const { token } = req.params;

      const user = await User.findByVerificationToken(token);
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired verification token' });
      }

      // Check if token is expired
      if (new Date() > user.verification_expires) {
        return res.status(400).json({ error: 'Verification token has expired' });
      }

      // Verify the user
      await User.verifyUser(user.id);

      res.json({ 
        message: 'Email verified successfully. You can now sign in.',
        verified: true 
      });
    } catch (error) {
      next(error);
    }
  },

  async resendVerification(req, res, next) {
    try {
      const { email } = req.body;

      const user = await User.findByEmail(email);
      if (!user) {
        return res.json({ message: 'If the email exists, a verification email has been sent.' });
      }

      if (user.is_verified) {
        return res.status(400).json({ error: 'Email is already verified' });
      }

      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await User.updateVerificationToken(user.id, verificationToken, verificationExpires);
      await sendVerificationEmail(email, verificationToken);

      res.json({ message: 'Verification email has been resent.' });
    } catch (error) {
      next(error);
    }
  },

  async getRegistrationConfig(req, res, next) {
    try {
      const registrationMode = getRegistrationMode();
      const emailConfigured = isEmailConfigured();
      const billingEnabled = getBillingEnabled();

      res.json({
        registrationMode,
        emailVerificationEnabled: emailConfigured,
        allowRegistration: registrationMode !== 'disabled',
        billingEnabled
      });
    } catch (error) {
      next(error);
    }
  },

  async sendTestEmail(req, res, next) {
    try {
      const testEmail = 'boverton@tradetally.io';
      
      // Send a test branded email using the verification template
      const testToken = crypto.randomBytes(32).toString('hex');
      await EmailService.sendVerificationEmail(testEmail, testToken);
      
      res.json({ 
        message: 'Test email sent successfully',
        recipient: testEmail,
        emailType: 'verification'
      });
    } catch (error) {
      console.error('Test email error:', error);
      next(error);
    }
  }
};

// Email sending function
async function sendVerificationEmail(email, token) {
  await EmailService.sendVerificationEmail(email, token);
}

// Password reset email function
async function sendPasswordResetEmail(email, token) {
  await EmailService.sendPasswordResetEmail(email, token);
}

module.exports = authController;