const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const authController = {
  async register(req, res, next) {
    try {
      console.log('Registration request body:', req.body);
      const { email, username, password, fullName } = req.body;

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

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const user = await User.create({ 
        email, 
        username, 
        password, 
        fullName,
        verificationToken,
        verificationExpires
      });
      await User.createSettings(user.id);

      // Send verification email
      await sendVerificationEmail(email, verificationToken);

      res.status(201).json({
        message: 'Registration successful. Please check your email to verify your account.',
        requiresVerification: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          isVerified: user.is_verified
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
      if (!user || !user.is_active) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValid = await User.verifyPassword(user, password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if email is verified
      if (!user.is_verified) {
        return res.status(403).json({ 
          error: 'Please verify your email before signing in',
          requiresVerification: true,
          email: user.email
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
          isVerified: user.is_verified
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
          isVerified: user.is_verified,
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

      res.json({ message: 'If the email exists, a reset link has been sent' });
    } catch (error) {
      next(error);
    }
  },

  async resetPassword(req, res, next) {
    try {
      const { token, password } = req.body;

      res.status(501).json({ error: 'Password reset not implemented' });
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

module.exports = authController;