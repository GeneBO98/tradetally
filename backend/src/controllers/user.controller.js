const User = require('../models/User');
const TierService = require('../services/tierService');
const EmailService = require('../services/emailService');

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
        // Check if new email is already in use
        const existingUser = await User.findByEmail(email);
        if (existingUser && existingUser.id !== req.user.id) {
          return res.status(409).json({ error: 'Email address is already in use' });
        }

        updates.email = email.toLowerCase();
      }

      const user = await User.update(req.user.id, updates);
      
      const response = { user };
      if (email !== undefined && email !== req.user.email) {
        response.message = 'Profile updated successfully.';
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
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 25;
      const offset = (page - 1) * limit;
      const search = req.query.search || '';
      
      const result = await User.getAllUsers(limit, offset, search);
      
      // Get overall statistics (not filtered by search)
      const stats = await User.getUserStatistics();
      
      res.json({
        ...result,
        page,
        totalPages: Math.ceil(result.total / limit),
        statistics: stats
      });
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
  },

  // Tier management functions
  async updateUserTier(req, res, next) {
    try {
      const { userId } = req.params;
      const { tier } = req.body;

      if (!['free', 'pro'].includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier. Must be "free" or "pro"' });
      }

      const user = await User.updateTier(userId, tier);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ user, message: `User tier updated to ${tier}` });
    } catch (error) {
      next(error);
    }
  },

  async setTierOverride(req, res, next) {
    try {
      const { userId } = req.params;
      const { tier, reason, expiresAt } = req.body;

      if (!['free', 'pro'].includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier. Must be "free" or "pro"' });
      }

      const override = await User.setTierOverride(
        userId,
        tier,
        reason,
        expiresAt,
        req.user.id // Admin who created the override
      );

      res.json({ 
        override, 
        message: `Tier override set to ${tier}${expiresAt ? ' until ' + new Date(expiresAt).toLocaleDateString() : ' permanently'}` 
      });
    } catch (error) {
      next(error);
    }
  },

  async removeTierOverride(req, res, next) {
    try {
      const { userId } = req.params;

      const removed = await User.removeTierOverride(userId);
      if (!removed) {
        return res.status(404).json({ error: 'No tier override found for this user' });
      }

      res.json({ message: 'Tier override removed successfully' });
    } catch (error) {
      next(error);
    }
  },

  async getTierOverride(req, res, next) {
    try {
      const { userId } = req.params;

      const override = await User.getTierOverride(userId);
      res.json({ override });
    } catch (error) {
      next(error);
    }
  },

  async getUserTier(req, res, next) {
    try {
      const { userId } = req.params;

      const tier = await TierService.getUserTier(userId);
      const subscription = await User.getSubscription(userId);
      const override = await User.getTierOverride(userId);

      res.json({ 
        tier,
        subscription,
        override,
        billingEnabled: await TierService.isBillingEnabled()
      });
    } catch (error) {
      next(error);
    }
  },

  async getTierStats(req, res, next) {
    try {
      const stats = await TierService.getTierStats();
      res.json({ stats });
    } catch (error) {
      next(error);
    }
  }
};

// Email change verification function
async function sendEmailChangeVerification(email, token) {
  await EmailService.sendEmailChangeVerification(email, token);
}

module.exports = userController;