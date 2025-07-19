const User = require('../models/User');
const db = require('../config/database');

class TierService {
  // Check if billing is enabled (for self-hosted vs SaaS)
  static async isBillingEnabled() {
    // First check environment variable
    if (process.env.BILLING_ENABLED !== undefined) {
      return process.env.BILLING_ENABLED === 'true';
    }
    
    // Fallback to database config
    const query = `SELECT value FROM instance_config WHERE key = 'billing_enabled'`;
    const result = await db.query(query);
    
    if (!result.rows[0]) return false;
    const value = result.rows[0].value;
    
    // Handle JSONB, string, and boolean values
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    if (value === null || value === undefined) return false;
    
    // For JSONB stored as object
    return value === true || value === 'true';
  }

  // Get effective tier for a user
  static async getUserTier(userId) {
    // If billing is disabled (self-hosted), always return 'pro'
    const billingEnabled = await this.isBillingEnabled();
    if (!billingEnabled) {
      return 'pro';
    }

    // Get user info to check role
    const user = await User.findById(userId);
    if (!user) return 'free';


    // Admins get Pro tier by default
    if (user.role === 'admin' || user.role === 'owner') {
      return 'pro';
    }

    // Check for tier override first
    const tierOverride = await User.getTierOverride(userId);
    if (tierOverride && (!tierOverride.expires_at || new Date(tierOverride.expires_at) > new Date())) {
      return tierOverride.tier;
    }

    // Check subscription status
    const subscription = await User.getSubscription(userId);
    if (subscription && subscription.status === 'active') {
      // Update user's tier based on subscription
      await User.updateTier(userId, 'pro');
      return 'pro';
    }

    // Return user's stored tier
    return user?.tier || 'free';
  }

  // Check if user has access to a specific feature
  static async hasFeatureAccess(userId, featureKey) {
    // If billing is disabled (self-hosted), grant all features
    const billingEnabled = await this.isBillingEnabled();
    if (!billingEnabled) {
      return true;
    }

    // Get feature requirements
    const query = `SELECT required_tier FROM features WHERE feature_key = $1 AND is_active = true`;
    const result = await db.query(query, [featureKey]);
    
    // If feature doesn't exist or is inactive, deny access
    if (!result.rows[0]) {
      return false;
    }

    const requiredTier = result.rows[0].required_tier;
    
    // If feature is free tier, everyone has access
    if (requiredTier === 'free') {
      return true;
    }

    // Check user's tier
    const userTier = await this.getUserTier(userId);
    return userTier === 'pro';
  }

  // Get all available features
  static async getAllFeatures() {
    const query = `
      SELECT feature_key, feature_name, description, required_tier, is_active
      FROM features
      ORDER BY required_tier, feature_name
    `;
    const result = await db.query(query);
    return result.rows;
  }

  // Create or update a feature
  static async upsertFeature(featureData) {
    const { featureKey, featureName, description, requiredTier, isActive = true } = featureData;
    
    const query = `
      INSERT INTO features (feature_key, feature_name, description, required_tier, is_active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (feature_key)
      DO UPDATE SET
        feature_name = EXCLUDED.feature_name,
        description = EXCLUDED.description,
        required_tier = EXCLUDED.required_tier,
        is_active = EXCLUDED.is_active,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const values = [featureKey, featureName, description, requiredTier, isActive];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Toggle feature active status
  static async toggleFeature(featureKey, isActive) {
    const query = `
      UPDATE features
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE feature_key = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [isActive, featureKey]);
    return result.rows[0];
  }

  // Get tier statistics
  static async getTierStats() {
    const query = `
      SELECT 
        tier,
        COUNT(*) as user_count
      FROM users
      WHERE is_active = true
      GROUP BY tier
    `;
    
    const result = await db.query(query);
    
    const stats = {
      free: 0,
      pro: 0,
      total: 0
    };
    
    result.rows.forEach(row => {
      stats[row.tier] = parseInt(row.user_count);
      stats.total += parseInt(row.user_count);
    });
    
    return stats;
  }

  // Handle subscription status update from Stripe
  static async handleSubscriptionUpdate(stripeSubscriptionId, status) {
    const query = `
      SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1
    `;
    const result = await db.query(query, [stripeSubscriptionId]);
    
    if (!result.rows[0]) {
      throw new Error('Subscription not found');
    }
    
    const userId = result.rows[0].user_id;
    
    // Update user tier based on subscription status
    if (status === 'active') {
      await User.updateTier(userId, 'pro');
    } else if (['canceled', 'unpaid', 'past_due'].includes(status)) {
      // Check if there's an active tier override
      const tierOverride = await User.getTierOverride(userId);
      if (!tierOverride || (tierOverride.expires_at && new Date(tierOverride.expires_at) <= new Date())) {
        await User.updateTier(userId, 'free');
      }
    }
    
    return userId;
  }
}

module.exports = TierService;