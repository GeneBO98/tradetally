const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');

// Check if email configuration is available
function isEmailConfigured() {
  return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
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
      let isVerified = !emailConfigured; // Auto-verify if email not configured
      let adminApproved = true; // Default to approved

      // Set admin approval based on registration mode
      if (registrationMode === 'approval' && !isFirstUser) {
        adminApproved = false; // Require admin approval for non-first users
      }

      if (emailConfigured) {
        // Generate verification token only if email is configured
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

      // Send verification email only if email is configured
      if (emailConfigured) {
        try {
          await sendVerificationEmail(email, verificationToken);
        } catch (error) {
          console.warn('⚠️  Failed to send verification email (continuing with registration):', error.message);
        }
      } else {
        console.log(`📧 Email verification skipped - no email configuration found for user: ${user.username}`);
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

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
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

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
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
          isVerified: user.is_verified,
          adminApproved: user.admin_approved,
          timezone: user.timezone,
          createdAt: user.created_at
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
      
      res.json({
        registrationMode,
        emailVerificationEnabled: emailConfigured,
        allowRegistration: registrationMode !== 'disabled'
      });
    } catch (error) {
      next(error);
    }
  }
};

// Email sending function
async function sendVerificationEmail(email, token) {
  // Only send emails if email configuration is provided
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    console.log('Email not configured, skipping verification email');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${token}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@tradetally.io',
    to: email,
    subject: 'Verify your TradeTally account',
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h1 style="color: #4F46E5;">Welcome to TradeTally!</h1>
        <p>Thank you for signing up. Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #6B7280;">${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
        <p style="color: #6B7280; font-size: 12px;">
          If you didn't create an account with TradeTally, you can safely ignore this email.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Verification email sent to:', email);
  } catch (error) {
    console.error('Failed to send verification email:', error);
    // Don't throw error to prevent registration failure due to email issues
  }
}

// Password reset email function
async function sendPasswordResetEmail(email, token) {
  // Only send emails if email configuration is provided
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    console.log('Email not configured, skipping password reset email');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${token}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@tradetally.io',
    to: email,
    subject: 'Reset your TradeTally password',
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h1 style="color: #4F46E5;">Reset Your Password</h1>
        <p>You requested to reset your password for your TradeTally account. Click the button below to reset it:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #6B7280;">${resetUrl}</p>
        <p>This link will expire in 1 hour for security reasons.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
        <p style="color: #6B7280; font-size: 12px;">
          If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', email);
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    // Don't throw error to prevent operation failure due to email issues
  }
}

module.exports = authController;