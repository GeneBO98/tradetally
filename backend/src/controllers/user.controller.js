const User = require('../models/User');
const Trade = require('../models/Trade');
const TierService = require('../services/tierService');
const EmailService = require('../services/emailService');
const ApiUsageService = require('../services/apiUsageService');
const db = require('../config/database');

const userController = {
  /**
   * Mark guided onboarding as completed (so modal is not shown again)
   * POST /api/users/onboarding-completed
   */
  async markOnboardingCompleted(req, res, next) {
    try {
      await User.markOnboardingCompleted(req.user.id);
      res.json({ success: true, message: 'Onboarding completed' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get onboarding status for first-value banner (is user new and not yet activated?)
   * GET /api/users/onboarding-status
   */
  async getOnboardingStatus(req, res, next) {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const created = user.created_at ? new Date(user.created_at) : new Date();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const isNew = created >= sevenDaysAgo;

      const query = `
        SELECT
          (SELECT COUNT(*) FROM trades WHERE user_id = $1) as trade_count,
          (SELECT COUNT(*) FROM import_logs WHERE user_id = $1 AND status = 'completed') as import_count
      `;
      const result = await db.query(query, [req.user.id]);
      const tradeCount = parseInt(result.rows[0].trade_count) || 0;
      const importCount = parseInt(result.rows[0].import_count) || 0;
      const hasActivated = tradeCount > 0 || importCount > 0;

      res.json({
        is_new: isNew,
        has_activated: hasActivated,
        created_at: user.created_at
      });
    } catch (error) {
      next(error);
    }
  },

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

  async getStatistics(req, res, next) {
    try {
      const stats = await User.getUserStatistics();
      res.json(stats);
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

      await User.deleteUser(userId, { deletionType: 'admin', deletedByAdminId: req.user.id });
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
  },

  async enrichTrades(req, res, next) {
    try {
      const userId = req.user.id;
      const db = require('../config/database');
      const jobQueue = require('../utils/jobQueue');

      // Count trades that need news enrichment
      const newsCountQuery = `
        SELECT COUNT(*) as count
        FROM trades
        WHERE user_id = $1
          AND exit_time IS NOT NULL
          AND exit_price IS NOT NULL
          AND (has_news IS NULL OR news_checked_at IS NULL)
      `;

      // Count trades that need quality grading
      const qualityCountQuery = `
        SELECT COUNT(*) as count
        FROM trades
        WHERE user_id = $1
          AND quality_grade IS NULL
      `;

      const [newsCountResult, qualityCountResult] = await Promise.all([
        db.query(newsCountQuery, [userId]),
        db.query(qualityCountQuery, [userId])
      ]);

      const newsTradesCount = parseInt(newsCountResult.rows[0].count);
      const qualityTradesCount = parseInt(qualityCountResult.rows[0].count);
      const totalTradesCount = Math.max(newsTradesCount, qualityTradesCount);

      if (totalTradesCount === 0) {
        return res.json({
          message: 'All trades are already enriched with news and quality data',
          tradesQueued: 0
        });
      }

      const jobIds = [];
      const enrichments = [];

      // Queue news enrichment job if needed
      if (newsTradesCount > 0) {
        const newsJobId = await jobQueue.addJob('news_backfill', {
          userId: userId,
          batchSize: 50,
          maxTrades: null
        });
        jobIds.push(newsJobId);
        enrichments.push(`news (${newsTradesCount} trades)`);
        console.log(`[SUCCESS] Queued news enrichment for ${newsTradesCount} trades (job ${newsJobId})`);
      }

      // Queue quality grading job if needed
      if (qualityTradesCount > 0) {
        const qualityJobId = await jobQueue.addJob('quality_backfill', {
          userId: userId,
          batchSize: 10, // Smaller batches for API rate limiting
          maxTrades: null
        });
        jobIds.push(qualityJobId);
        enrichments.push(`quality (${qualityTradesCount} trades)`);
        console.log(`[SUCCESS] Queued quality enrichment for ${qualityTradesCount} trades (job ${qualityJobId})`);
      }

      res.json({
        message: `Enrichment jobs queued: ${enrichments.join(', ')}`,
        tradesQueued: totalTradesCount,
        newsTradesQueued: newsTradesCount,
        qualityTradesQueued: qualityTradesCount,
        jobIds: jobIds
      });
    } catch (error) {
      console.error('[ERROR] Failed to queue trade enrichment:', error.message);
      next(error);
    }
  },

  /**
   * Get user's quality weight preferences
   */
  async getQualityWeights(req, res, next) {
    try {
      const db = require('../config/database');

      const query = `
        SELECT
          quality_weight_news,
          quality_weight_gap,
          quality_weight_relative_volume,
          quality_weight_float,
          quality_weight_price_range
        FROM users
        WHERE id = $1
      `;

      const result = await db.query(query, [req.user.id]);

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const weights = result.rows[0];

      res.json({
        qualityWeights: {
          news: weights.quality_weight_news || 30,
          gap: weights.quality_weight_gap || 20,
          relativeVolume: weights.quality_weight_relative_volume || 20,
          float: weights.quality_weight_float || 15,
          priceRange: weights.quality_weight_price_range || 15
        }
      });
    } catch (error) {
      console.error('[ERROR] Failed to fetch quality weights:', error.message);
      next(error);
    }
  },

  /**
   * Update user's quality weight preferences
   */
  async updateQualityWeights(req, res, next) {
    try {
      const db = require('../config/database');
      const { news, gap, relativeVolume, float, priceRange } = req.body;

      // Validate that all weights are provided
      if (news === undefined || gap === undefined || relativeVolume === undefined ||
          float === undefined || priceRange === undefined) {
        return res.status(400).json({
          error: 'All quality weights must be provided (news, gap, relativeVolume, float, priceRange)'
        });
      }

      // Validate that all weights are numbers
      if (typeof news !== 'number' || typeof gap !== 'number' ||
          typeof relativeVolume !== 'number' || typeof float !== 'number' ||
          typeof priceRange !== 'number') {
        return res.status(400).json({ error: 'All weights must be numbers' });
      }

      // Validate ranges (0-100)
      if (news < 0 || news > 100 || gap < 0 || gap > 100 ||
          relativeVolume < 0 || relativeVolume > 100 ||
          float < 0 || float > 100 || priceRange < 0 || priceRange > 100) {
        return res.status(400).json({ error: 'All weights must be between 0 and 100' });
      }

      // Validate that weights sum to 100
      const total = news + gap + relativeVolume + float + priceRange;
      if (total !== 100) {
        return res.status(400).json({
          error: `Weights must sum to 100. Current total: ${total}`
        });
      }

      // Update user's quality weights
      const query = `
        UPDATE users
        SET
          quality_weight_news = $1,
          quality_weight_gap = $2,
          quality_weight_relative_volume = $3,
          quality_weight_float = $4,
          quality_weight_price_range = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING
          quality_weight_news,
          quality_weight_gap,
          quality_weight_relative_volume,
          quality_weight_float,
          quality_weight_price_range
      `;

      const result = await db.query(query, [
        news, gap, relativeVolume, float, priceRange, req.user.id
      ]);

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const weights = result.rows[0];

      res.json({
        message: 'Quality weights updated successfully',
        qualityWeights: {
          news: weights.quality_weight_news,
          gap: weights.quality_weight_gap,
          relativeVolume: weights.quality_weight_relative_volume,
          float: weights.quality_weight_float,
          priceRange: weights.quality_weight_price_range
        }
      });
    } catch (error) {
      console.error('[ERROR] Failed to update quality weights:', error.message);
      next(error);
    }
  },

  // Get API usage statistics for the current user
  async getApiUsage(req, res, next) {
    try {
      const userId = req.user.id;
      const usage = await ApiUsageService.getAllUserUsage(userId);

      res.json({
        success: true,
        data: usage
      });
    } catch (error) {
      console.error('[ERROR] Failed to get API usage:', error.message);
      next(error);
    }
  },

  // Delete own account (requires password confirmation)
  async deleteOwnAccount(req, res, next) {
    try {
      const { password } = req.body;
      const userId = req.user.id;

      if (!password) {
        return res.status(400).json({ error: 'Password is required to confirm account deletion' });
      }

      // Get user with password hash
      const user = await User.findByEmail(req.user.email);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify password
      const isValid = await User.verifyPassword(user, password);
      if (!isValid) {
        return res.status(401).json({ error: 'Incorrect password' });
      }

      // Prevent the last admin from deleting themselves
      if (user.role === 'admin') {
        const adminCount = await User.getAdminCount();
        if (adminCount === 1) {
          return res.status(400).json({ error: 'Cannot delete the last admin account. Please assign another admin first.' });
        }
      }

      // Delete the user account (self-deletion)
      await User.deleteUser(userId, { deletionType: 'self', deletedByAdminId: null });

      console.log(`[INFO] User ${user.username} (ID: ${userId}) deleted their own account`);

      res.json({ message: 'Account deleted successfully' });
    } catch (error) {
      console.error('[ERROR] Failed to delete own account:', error.message);
      next(error);
    }
  }
};

// Email change verification function
async function sendEmailChangeVerification(email, token) {
  await EmailService.sendEmailChangeVerification(email, token);
}

module.exports = userController;