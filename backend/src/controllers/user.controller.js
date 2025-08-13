const User = require('../models/User');

const userController = {
  async getProfile(req, res, next) {
    try {
      const user = await User.findById(req.user.id);
      const settings = await User.getSettings(req.user.id);

      res.json({
        user,
        settings
      });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const { fullName, timezone, email } = req.body;
      
      const updates = {};
      if (fullName !== undefined) updates.full_name = fullName;
      if (timezone !== undefined) updates.timezone = timezone;

      // Check if email change is requested
      if (email !== undefined && email !== req.user.email) {
        // Verify user has 2FA enabled
        const currentUser = await User.findById(req.user.id);
        if (!currentUser.two_factor_enabled) {
          return res.status(403).json({ 
            error: 'Two-factor authentication must be enabled to change email address' 
          });
        }

        // Check if new email is already in use
        const existingUser = await User.findByEmail(email);
        if (existingUser && existingUser.id !== req.user.id) {
          return res.status(409).json({ error: 'Email address is already in use' });
        }

        // Generate email verification token
        const crypto = require('crypto');
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        updates.email = email.toLowerCase();
        updates.is_verified = false; // Require re-verification
        updates.verification_token = verificationToken;
        updates.verification_expires = verificationExpires;

        // Send verification email to new address
        try {
          await sendEmailChangeVerification(email, verificationToken);
        } catch (emailError) {
          console.warn('Failed to send email change verification:', emailError.message);
          return res.status(500).json({ 
            error: 'Failed to send verification email. Please try again.' 
          });
        }
      }

      const user = await User.update(req.user.id, updates);
      
      const response = { user };
      if (email !== undefined && email !== req.user.email) {
        response.message = 'Profile updated. Please check your new email address for verification.';
        response.emailChanged = true;
      }
      
      res.json(response);
    } catch (error) {
      next(error);
    }
  },

  async uploadAvatar(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      const user = await User.update(req.user.id, { avatar_url: avatarUrl });
      
      res.json({ user });
    } catch (error) {
      next(error);
    }
  },

  async deleteAvatar(req, res, next) {
    try {
      const user = await User.update(req.user.id, { avatar_url: null });
      res.json({ user });
    } catch (error) {
      next(error);
    }
  },

  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findByEmail(req.user.email);
      const isValid = await User.verifyPassword(user, currentPassword);
      
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      await User.update(req.user.id, { password: newPassword });
      
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  },

  async getPublicProfile(req, res, next) {
    try {
      const user = await User.findByUsername(req.params.username);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const settings = await User.getSettings(user.id);
      
      if (!settings?.public_profile) {
        return res.status(403).json({ error: 'Profile is private' });
      }

      res.json({
        user: {
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          createdAt: user.created_at
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getUserPublicTrades(req, res, next) {
    try {
      const user = await User.findByUsername(req.params.username);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const settings = await User.getSettings(user.id);
      
      if (!settings?.public_profile) {
        return res.status(403).json({ error: 'Profile is private' });
      }

      const trades = await Trade.getPublicTrades({ username: req.params.username });
      
      res.json({ trades });
    } catch (error) {
      next(error);
    }
  },

  // Admin-only user management endpoints
  async getAllUsers(req, res, next) {
    try {
      const users = await User.getAllUsers();
      res.json({ users });
    } catch (error) {
      next(error);
    }
  },

  async getPendingUsers(req, res, next) {
    try {
      const users = await User.getPendingUsers();
      res.json({ users });
    } catch (error) {
      next(error);
    }
  },

  async approveUser(req, res, next) {
    try {
      const { userId } = req.params;
      
      const user = await User.approveUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ 
        message: 'User approved successfully',
        user 
      });
    } catch (error) {
      next(error);
    }
  },

  async updateUserRole(req, res, next) {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be "user" or "admin"' });
      }

      // Prevent removing admin role from the last admin
      if (role === 'user') {
        const adminCount = await User.getAdminCount();
        const targetUser = await User.findById(userId);
        
        if (adminCount === 1 && targetUser.role === 'admin') {
          return res.status(400).json({ error: 'Cannot remove admin role from the last admin user' });
        }
      }

      const user = await User.updateRole(userId, role);
      res.json({ user, message: `User role updated to ${role}` });
    } catch (error) {
      next(error);
    }
  },

  async toggleUserStatus(req, res, next) {
    try {
      const { userId } = req.params;
      const { isActive } = req.body;

      // Prevent deactivating the last admin
      if (!isActive) {
        const targetUser = await User.findById(userId);
        if (targetUser.role === 'admin') {
          const activeAdminCount = await User.getActiveAdminCount();
          if (activeAdminCount === 1) {
            return res.status(400).json({ error: 'Cannot deactivate the last active admin user' });
          }
        }
      }

      const user = await User.updateStatus(userId, isActive);
      res.json({ user, message: `User ${isActive ? 'activated' : 'deactivated'}` });
    } catch (error) {
      next(error);
    }
  },

  async deleteUser(req, res, next) {
    try {
      const { userId } = req.params;

      // Prevent deleting yourself
      if (userId === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      // Get user details before deletion (admin can delete inactive users too)
      const targetUser = await User.findByIdForAdmin(userId);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Prevent deleting the last admin
      if (targetUser.role === 'admin') {
        const adminCount = await User.getAdminCount();
        if (adminCount === 1) {
          return res.status(400).json({ error: 'Cannot delete the last admin user' });
        }
      }

      await User.deleteUser(userId);
      res.json({ message: `User ${targetUser.username} has been permanently deleted` });
    } catch (error) {
      next(error);
    }
  },

  // Admin user management functions
  async getAllUsers(req, res, next) {
    try {
      const users = await User.getAllUsers();
      res.json({ users });
    } catch (error) {
      next(error);
    }
  },

  async getPendingUsers(req, res, next) {
    try {
      const users = await User.getPendingUsers();
      res.json({ users });
    } catch (error) {
      next(error);
    }
  },

  async approveUser(req, res, next) {
    try {
      const { userId } = req.params;
      
      const user = await User.approveUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ user, message: 'User approved successfully' });
    } catch (error) {
      next(error);
    }
  },

  async verifyUser(req, res, next) {
    try {
      const { userId } = req.params;
      
      const user = await User.verifyUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ user, message: 'User verified successfully' });
    } catch (error) {
      next(error);
    }
  }
};

// Email change verification function
async function sendEmailChangeVerification(email, token) {
  // Only send emails if email configuration is provided
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    console.log('Email not configured, skipping email change verification email');
    return;
  }

  const nodemailer = require('nodemailer');
  
  const transporter = nodemailer.createTransporter({
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
    subject: 'Verify your new email address - TradeTally',
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h1 style="color: #4F46E5;">Email Address Change</h1>
        <p>You have requested to change your email address for your TradeTally account. Please verify your new email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Verify New Email Address
          </a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #6B7280;">${verificationUrl}</p>
        <p>This link will expire in 24 hours for security reasons.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
        <p style="color: #6B7280; font-size: 12px;">
          If you didn't request this email change, please secure your account immediately and contact support.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email change verification email sent to:', email);
  } catch (error) {
    console.error('Failed to send email change verification email:', error);
    throw error;
  }
}

module.exports = userController;