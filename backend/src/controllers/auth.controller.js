const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { generateToken, TOKEN_PURPOSES, verifyJwtToken } = require('../middleware/auth');
const crypto = require('crypto');
const EmailService = require('../services/emailService');
const bcrypt = require('bcryptjs');
const TierService = require('../services/tierService');
const YearWrappedService = require('../services/yearWrappedService');
const refreshTokenService = require('../services/refreshToken.service');
const SampleDataService = require('../services/sampleDataService');
const activityTrackingService = require('../services/activityTrackingService');
const accountLockout = require('../services/accountLockoutService');
const { getClientIp } = require('../utils/clientIp');
const { generateCsrfToken } = require('../middleware/csrf');
const { clearAuthCookies, setAuthCookies } = require('../utils/authCookies');
const jobQueue = require('../utils/jobQueue');

const PROTECTED_EMAIL = (process.env.DEMO_EMAIL || 'demo@example.com').toLowerCase();

// Check if email configuration is available
function isEmailConfigured() {
  return EmailService.isConfigured();
}

// Check if detailed error messages are enabled (for self-hosted setups)
function useDetailedErrors() {
  return process.env.NODE_ENV !== 'production' &&
    (process.env.DETAILED_AUTH_ERRORS === 'true' || !isEmailConfigured());
}

// Get registration mode from environment
function getRegistrationMode() {
  const mode = process.env.REGISTRATION_MODE || 'open';
  const validModes = ['disabled', 'approval', 'open'];
  return validModes.includes(mode) ? mode : 'open';
}

// Auto-generate a unique username from email
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

// Get billing enabled from environment (defaults to false)
function getBillingEnabled() {
  return process.env.BILLING_ENABLED === 'true';
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) return `**@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
}

function sendVerificationEmailInBackground(email, token) {
  setImmediate(async () => {
    try {
      await jobQueue.addJob('verification_email', { email, token }, 2);
    } catch (error) {
      console.warn('[WARNING] Failed to send verification email after registration:', error.message);
    }
  });
}

function queuePasswordResetEmail(email, token) {
  setImmediate(async () => {
    try {
      await jobQueue.addJob('password_reset_email', { email, token }, 2);
    } catch (error) {
      console.warn('[WARNING] Failed to queue password reset email:', error.message);
    }
  });
}


const authController = {
  async register(req, res, next) {
    try {
      const { email, username: providedUsername, password, fullName, marketing_consent } = req.body;

      // Check registration mode
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
        adminApproved,
        marketingConsent: marketing_consent || false
      });
      await User.createSettings(user.id);

      // Record acquisition data (UTM params, referral source, IP, user agent)
      try {
        const db = require('../config/database');
        const { utm_source, utm_medium, utm_campaign, utm_term, utm_content, referral_source, landing_page } = req.body;
        await db.query(`
          INSERT INTO user_acquisition (user_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referral_source, registration_method, landing_page, registration_ip, registration_user_agent)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (user_id) DO NOTHING
        `, [
          user.id,
          utm_source || null,
          utm_medium || null,
          utm_campaign || null,
          utm_term || null,
          utm_content || null,
          referral_source || req.headers.referer || null,
          'direct',
          landing_page || null,
          (marketing_consent) ? getClientIp(req) : null,
          (marketing_consent) ? (req.headers['user-agent'] || null) : null
        ]);
      } catch (acqErr) {
        console.log('[REGISTER] Acquisition tracking failed (non-blocking):', acqErr.message);
      }

      // Track registration event
      activityTrackingService.trackEvent(user.id, 'auth.register', 'auth', {
        registration_method: 'direct',
        has_utm: !!(req.body.utm_source || req.body.utm_campaign)
      }, {
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
        marketingConsent: marketing_consent
      });

      // For new users on billing-enabled instances: seed sample data and grant
      // a 14-day Pro trial. Both are best-effort and never block registration.
      // First user is skipped — they're an admin and get Pro tier permanently.
      let billingEnabled = false;
      try {
        billingEnabled = await TierService.isBillingEnabled(req.headers.host);
        console.log(`[REGISTER] Billing check: billingEnabled=${billingEnabled}, isFirstUser=${isFirstUser}`);
      } catch (billingErr) {
        console.log('[REGISTER] Billing status check failed (non-blocking):', billingErr.message);
      }

      if (billingEnabled && !isFirstUser) {
        try {
          await SampleDataService.createForUser(user.id);
          console.log(`[REGISTER] Sample data created for new user ${user.username}`);
        } catch (sampleErr) {
          console.log('[REGISTER] Sample data creation failed (non-blocking):', sampleErr.message);
        }

        // Auto-grant 14-day Pro trial. Reason matches the manual /billing/start-trial
        // flow ('Free 14-day trial') so trialScheduler picks it up for reminder
        // and expiration emails. A DB trigger sets users.trial_used = true when
        // a tier_override with reason ILIKE '%trial%' is inserted.
        try {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 14);
          await User.createTierOverride(user.id, 'pro', 'Free 14-day trial', expiresAt, null);
          await User.setProOnboardingStep(user.id, 1);
          console.log(`[REGISTER] 14-day Pro trial granted for new user ${user.username} (expires ${expiresAt.toISOString()})`);
        } catch (trialErr) {
          console.log('[REGISTER] Trial grant failed (non-blocking):', trialErr.message);
        }
      } else {
        console.log(`[REGISTER] Skipping sample data + trial: billingEnabled=${billingEnabled}, isFirstUser=${isFirstUser}`);
      }

      // Log if this user was made an admin
      if (isFirstUser) {
        console.log(`🔐 First user registered - automatically granted admin privileges: ${user.username} (${maskEmail(user.email)})`);
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

      // Auto-login: generate token and sign user in immediately (unless approval-pending)
      if (adminApproved) {
        await User.updateLastLogin(user.id);

        YearWrappedService.recordLogin(user.id).catch(err => {
          console.warn('[AUTH] Failed to record login for year wrapped:', err.message);
        });

        const authToken = generateToken(user, { purpose: TOKEN_PURPOSES.ACCESS });

        setAuthCookies(req, res, authToken, generateCsrfToken());

        const { tier: userTier, billingEnabled: billingStatus } = await TierService.getUserTierWithBillingStatus(user.id, req.headers.host);
        const regSettings = await User.getSettings(user.id);

        res.status(201).json({
          message,
          requiresVerification: emailConfigured,
          requiresApproval: false,
          registrationMode,
          isFirstUser,
          emailConfigured,
          is_first_login: true,
          token: authToken,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            fullName: user.full_name,
            avatarUrl: user.avatar_url,
            role: user.role,
            tier: userTier,
            billingEnabled: billingStatus,
            isVerified: user.is_verified,
            adminApproved: user.admin_approved,
            twoFactorEnabled: false,
            createdAt: user.created_at,
            onboarding_step: (regSettings && regSettings.onboarding_step) || 0,
            pro_onboarding_step: (regSettings && regSettings.pro_onboarding_step) || 0
          }
        });
      } else {
        // Approval-pending: no auto-login
        res.status(201).json({
          message,
          requiresVerification: emailConfigured,
          requiresApproval: true,
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
      }

      if (emailConfigured && !isFirstUser) {
        sendVerificationEmailInBackground(email, verificationToken);
      } else {
        console.log(`[INFO] Email verification skipped - no email configuration found for user: ${user.username}`);
      }
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

      // Block locked accounts before checking the password so they can't be probed.
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

      // Correct password clears the failed-attempt counter.
      await accountLockout.recordSuccess(user);

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
        const tempToken = generateToken(user, {
          purpose: TOKEN_PURPOSES.PRE_2FA,
          expiresIn: '15m'
        });
        return res.json({
          requires2FA: true,
          tempToken: tempToken,
          message: 'Please provide your 2FA verification code'
        });
      }

      const isFirstLogin = user.last_login_at == null;
      // Update last_login_at for analytics tracking
      await User.updateLastLogin(user.id);

      // Record login for Year Wrapped streak tracking
      YearWrappedService.recordLogin(user.id).catch(err => {
        console.warn('[AUTH] Failed to record login for year wrapped:', err.message);
      });

      // Track login event for activity analytics
      activityTrackingService.trackEvent(user.id, 'auth.login', 'auth', {
        is_first_login: isFirstLogin,
        method: 'password'
      }, {
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
        marketingConsent: user.marketing_consent
      });

      const token = generateToken(user, { purpose: TOKEN_PURPOSES.ACCESS });

      setAuthCookies(req, res, token, generateCsrfToken());

      // Get user tier and billing status in one optimized call
      const TierService = require('../services/tierService');
      const { tier: userTier, billingEnabled } = await TierService.getUserTierWithBillingStatus(user.id, req.headers.host);

      // Get onboarding step for guided tour
      const loginSettings = await User.getSettings(user.id);

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
          twoFactorEnabled: user.two_factor_enabled || false,
          createdAt: user.created_at,
          onboarding_step: (loginSettings && loginSettings.onboarding_step) || 0,
          pro_onboarding_step: (loginSettings && loginSettings.pro_onboarding_step) || 0
        },
        is_first_login: isFirstLogin,
        token
      });
    } catch (error) {
      next(error);
    }
  },

  async verify2FA(req, res, next) {
    try {
      const tempToken = (req.body.tempToken || req.body.temp_token || req.body.token || '').trim();
      const twoFactorCode = String(req.body.twoFactorCode || req.body.two_factor_code || req.body.code || '').trim();

      if (!tempToken || !twoFactorCode) {
        return res.status(400).json({ error: 'Temporary token and 2FA code are required' });
      }

      // Verify the temporary token
      const speakeasy = require('speakeasy');
      
      let decoded;
      try {
        decoded = verifyJwtToken(tempToken, { requiredPurpose: TOKEN_PURPOSES.PRE_2FA });
      } catch (error) {
        try {
          // Accept legacy temp tokens minted before token-purpose enforcement.
          const legacyDecoded = jwt.verify(tempToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
          if (legacyDecoded.purpose) {
            throw error;
          }
          decoded = legacyDecoded;
        } catch (_) {
          return res.status(401).json({ error: 'Invalid or expired temporary token' });
        }
      }

      const user = await User.findById(decoded.id || decoded.userId);
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

      const isFirstLogin = user.last_login_at == null;
      // Update last_login_at for analytics tracking (2FA login)
      await User.updateLastLogin(user.id);

      // Record login for Year Wrapped streak tracking
      YearWrappedService.recordLogin(user.id).catch(err => {
        console.warn('[AUTH] Failed to record login for year wrapped:', err.message);
      });

      // Track 2FA login event for activity analytics
      activityTrackingService.trackEvent(user.id, 'auth.login', 'auth', {
        is_first_login: isFirstLogin,
        method: '2fa'
      }, {
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
        marketingConsent: user.marketing_consent
      });

      // Generate full access token
      const token = generateToken(user, { purpose: TOKEN_PURPOSES.ACCESS });

      setAuthCookies(req, res, token, generateCsrfToken());

      // Get tier and billing status
      const TierService = require('../services/tierService');
      const userTier = await TierService.getUserTier(user.id, req.headers.host);
      const billingEnabled = await TierService.isBillingEnabled(req.headers.host);

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
        is_first_login: isFirstLogin,
        token
      });
    } catch (error) {
      next(error);
    }
  },

  async logout(req, res, next) {
    try {
      clearAuthCookies(req, res);

      res.json({ message: 'Logout successful' });
    } catch (error) {
      next(error);
    }
  },

  async getMe(req, res, next) {
    try {
      const user = await User.findById(req.user.id);
      const settings = await User.getSettings(req.user.id);
      const onboardingCompleted = !!(settings && settings.onboarding_completed_at);

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
          billingEnabled: req.user.billingEnabled,
          onboarding_completed: onboardingCompleted,
          onboarding_step: (settings && settings.onboarding_step) || 0,
          pro_onboarding_step: (settings && settings.pro_onboarding_step) || 0
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

  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;

      // Return the same generic message to avoid leaking the protection
      if (email?.toLowerCase() === PROTECTED_EMAIL) {
        return res.json({ message: 'If the email exists, a reset link has been sent' });
      }

      const user = await User.findByEmail(email);
      if (!user) {
        return res.json({ message: 'If the email exists, a reset link has been sent' });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await User.updateResetToken(user.id, resetToken, resetExpires);
      queuePasswordResetEmail(email, resetToken);

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

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
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

  async unlockAccount(req, res, next) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Unlock token is required' });
      }

      const user = await User.findByUnlockToken(token);
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired unlock link. Please reset your password to regain access.' });
      }

      await User.unlockAccount(user.id);

      res.json({ message: 'Your account has been unlocked. You can now sign in.' });
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
      sendVerificationEmailInBackground(email, verificationToken);

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
      if (process.env.NODE_ENV === 'production' && (!req.user || req.user.role !== 'admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

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

module.exports = authController;
