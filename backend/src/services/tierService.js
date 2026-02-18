const User = require('../models/User');
const db = require('../config/database');
const { getTierLimits, hasReachedLimit, getRemainingQuota, PRICING } = require('../config/tierLimits');

class TierService {
  // Cache for environment-based billing override so we only log once per process
  static _billingEnvOverride = undefined; // undefined = not checked yet, null = no override, boolean = forced value
  // Cache for domain-based billing check so it only logs once per process
  static _billingDomainResult = undefined; // undefined = not checked yet, boolean = cached result

  static _getBillingEnvOverride() {
    // If we've already resolved the override (including "no override"), just return it
    if (this._billingEnvOverride !== undefined) {
      return this._billingEnvOverride;
    }

    // First check environment variable (CRITICAL: Check this FIRST for self-hosted)
    if (process.env.BILLING_ENABLED !== undefined) {
      const enabled = process.env.BILLING_ENABLED === 'true';
      console.log(
        `[BILLING] Environment variable check: BILLING_ENABLED=${process.env.BILLING_ENABLED}, returning:`,
        enabled
      );
      this._billingEnvOverride = enabled;
      return this._billingEnvOverride;
    }

    // Also check FEATURES_BILLING_ENABLED for backwards compatibility
    if (process.env.FEATURES_BILLING_ENABLED !== undefined) {
      const enabled = process.env.FEATURES_BILLING_ENABLED === 'true';
      console.log(
        `[BILLING] Features env variable check: FEATURES_BILLING_ENABLED=${process.env.FEATURES_BILLING_ENABLED}, returning:`,
        enabled
      );
      this._billingEnvOverride = enabled;
      return this._billingEnvOverride;
    }

    // No env override configured
    this._billingEnvOverride = null;
    return this._billingEnvOverride;
  }

  // Check if billing is enabled (for self-hosted vs SaaS)
  static async isBillingEnabled(hostHeader = null) {
    // Prefer cached env override if set (only logged once per process)
    const envOverride = this._getBillingEnvOverride();
    if (envOverride !== null) {
      return envOverride;
    }

    // Return cached domain result if already determined (only log once per process)
    if (this._billingDomainResult !== undefined) {
      return this._billingDomainResult;
    }

    // Auto-disable billing for non-tradetally.io domains (self-hosted)
    const frontendUrl = process.env.FRONTEND_URL || '';

    // Check host header if provided (for runtime domain detection)
    // Only ENABLE for tradetally.io, disable for everything else (including localhost for self-hosted)
    if (hostHeader && !hostHeader.includes('tradetally.io')) {
      console.log(`[BILLING] Disabled for host: ${hostHeader} (not tradetally.io)`);
      this._billingDomainResult = false;
      return false;
    }

    // Check frontend URL if no host header provided
    // Only ENABLE for tradetally.io, disable for everything else
    if (!hostHeader && frontendUrl && !frontendUrl.includes('tradetally.io')) {
      console.log(`[BILLING] Disabled for frontend URL: ${frontendUrl} (not tradetally.io)`);
      this._billingDomainResult = false;
      return false;
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

  // Get effective tier for a user (optimized: single query when possible)
  static async getUserTier(userId) {
    // If billing is disabled (self-hosted), always return 'pro'
    const billingEnabled = await this.isBillingEnabled();
    if (!billingEnabled) {
      return 'pro';
    }

    // Optimized: Single query to get user + tier override + subscription in one round trip
    const query = `
      SELECT
        u.id, u.role, u.tier,
        t.tier as override_tier, t.expires_at as override_expires,
        s.status as subscription_status
      FROM users u
      LEFT JOIN tier_overrides t ON t.user_id = u.id
      LEFT JOIN subscriptions s ON s.user_id = u.id
      WHERE u.id = $1
    `;

    const result = await db.query(query, [userId]);
    if (!result.rows[0]) return 'free';

    const row = result.rows[0];

    // Admins get Pro tier by default
    if (row.role === 'admin' || row.role === 'owner') {
      return 'pro';
    }

    // Check for tier override first
    if (row.override_tier && (!row.override_expires || new Date(row.override_expires) > new Date())) {
      return row.override_tier;
    }

    // Check subscription status
    if (row.subscription_status === 'active') {
      // Update user's tier based on subscription (background, non-blocking)
      User.updateTier(userId, 'pro').catch(() => {});
      return 'pro';
    }

    // Return user's stored tier
    return row.tier || 'free';
  }

  // Get user tier and billing status in one call (optimized for login)
  static async getUserTierWithBillingStatus(userId) {
    const billingEnabled = await this.isBillingEnabled();
    if (!billingEnabled) {
      return { tier: 'pro', billingEnabled: false };
    }

    const tier = await this.getUserTier(userId);
    return { tier, billingEnabled: true };
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

  // Get tier limits for a user
  static async getUserLimits(userId) {
    const tier = await this.getUserTier(userId);
    return getTierLimits(tier);
  }

  // Check if user can import trades (batch limit for free tier)
  static async canImportTrades(userId, count) {
    const tier = await this.getUserTier(userId);
    const limits = getTierLimits(tier);

    // Pro tier has unlimited imports
    if (tier === 'pro' || limits.maxTradesPerImport === null) {
      return {
        allowed: true,
        remaining: null,
        tier
      };
    }

    const maxPerImport = limits.maxTradesPerImport;
    const allowed = count <= maxPerImport;

    return {
      allowed,
      remaining: allowed ? maxPerImport - count : 0,
      max: maxPerImport,
      tier,
      message: allowed
        ? null
        : `Free tier is limited to ${maxPerImport} trades per import. You attempted to import ${count} trades. Please upgrade to Pro for unlimited batch imports, or split your import into smaller batches.`
    };
  }

  // Get user's current usage statistics
  static async getUserUsageStats(userId) {
    const tier = await this.getUserTier(userId);
    const limits = getTierLimits(tier);

    // Get trade count
    const tradeCountQuery = `SELECT COUNT(*) as trade_count FROM trades WHERE user_id = $1`;
    const tradeResult = await db.query(tradeCountQuery, [userId]);
    const tradeCount = parseInt(tradeResult.rows[0].trade_count);

    // Get journal entry count
    const journalCountQuery = `SELECT COUNT(*) as entry_count FROM diary_entries WHERE user_id = $1`;
    const journalResult = await db.query(journalCountQuery, [userId]);
    const journalCount = parseInt(journalResult.rows[0].entry_count);

    // Get watchlist count
    const watchlistCountQuery = `SELECT COUNT(*) as watchlist_count FROM watchlists WHERE user_id = $1`;
    const watchlistResult = await db.query(watchlistCountQuery, [userId]);
    const watchlistCount = parseInt(watchlistResult.rows[0].watchlist_count);

    // Get price alerts count
    const alertCountQuery = `SELECT COUNT(*) as alert_count FROM price_alerts WHERE user_id = $1`;
    const alertResult = await db.query(alertCountQuery, [userId]);
    const alertCount = parseInt(alertResult.rows[0].alert_count);

    return {
      tier,
      trades: {
        current: tradeCount,
        max: null, // Unlimited for all tiers
        remaining: null, // Unlimited
        maxPerImport: limits.maxTradesPerImport // Batch import limit for free tier
      },
      journalEntries: {
        current: journalCount,
        max: null, // Unlimited for all tiers
        remaining: null // Unlimited
      },
      watchlists: {
        current: watchlistCount,
        max: limits.maxWatchlists,
        remaining: limits.maxWatchlists ? Math.max(0, limits.maxWatchlists - watchlistCount) : null
      },
      priceAlerts: {
        current: alertCount,
        max: limits.maxPriceAlerts,
        remaining: limits.maxPriceAlerts ? Math.max(0, limits.maxPriceAlerts - alertCount) : null
      }
    };
  }

  // Get pricing information
  static getPricing() {
    return PRICING;
  }

  // Get tier comparison info
  static getTierComparison() {
    return {
      free: {
        name: 'Free',
        tagline: 'Get started journaling easily',
        price: 0,
        features: [
          'Basic dashboard',
          'Unlimited trade journaling + core metrics (P/L, win rate, profit factor)',
          'Unlimited journal entries',
          'Calendar view (P/L per day)',
          'Leaderboard (view-only, limited)',
          'Basic charts (equity curve, volume, performance by day)',
          'Batch imports up to 100 trades at once'
        ]
      },
      pro: {
        name: 'Pro',
        tagline: 'Unlock your trading edge',
        price: 8,
        interval: 'month',
        features: [
          'Unlimited batch imports',
          'Financial news feed + upcoming earnings',
          'All advanced analytics (SQN, Kelly, MAE/MFE, K-ratio, sector breakdowns, time-of-day)',
          'Behavioral analytics suite (revenge trading, loss aversion, personality typing)',
          'Health analytics (heart rate, sleep, stress correlations)',
          'Watchlists + alerts (email + iOS push)',
          'Advanced leaderboard filters (compare by strategy, time frame)',
          'API access',
          'AI Insights',
          'AI Conversations (100 credits/month with follow-up questions)'
        ],
        upgradeMessage: 'Upgrade to Pro to understand why you win or lose — not just how often.'
      }
    };
  }
}

module.exports = TierService;