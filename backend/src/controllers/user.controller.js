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
  }
};

module.exports = userController;