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
      const { fullName, timezone } = req.body;
      
      const updates = {};
      if (fullName !== undefined) updates.full_name = fullName;
      if (timezone !== undefined) updates.timezone = timezone;

      const user = await User.update(req.user.id, updates);
      
      res.json({ user });
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

      // Get user details before deletion
      const targetUser = await User.findById(userId);
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
  }
};

module.exports = userController;