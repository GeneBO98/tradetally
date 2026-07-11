const User = require('../models/User');
const db = require('../config/database');
const tierCache = require('./tierCache');
const { getTierLimits, hasReachedLimit, getRemainingQuota, PRICING, BROKER_SYNC_ACCESS } = require('../config/tierLimits');

class TierService {
  // Cache for environment-based billing override so we only log once per process
  static _billingEnvOverride = undefined; // undefined = not checked yet, null = no override, boolean = forced value

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

    // Auto-disable billing for non-tradetally.io domains (self-hosted)
    const frontendUrl = process.env.FRONTEND_URL || '';

    // Check host header if provided (for runtime domain detection)
    // Only ENABLE for tradetally.io, disable for everything else (including localhost for self-hosted)
    if (hostHeader && !hostHeader.includes('tradetally.io')) {
      console.log(`[BILLING] Disabled for host: ${hostHeader} (not tradetally.io)`);
      return false;
    }

    // Check frontend URL if no host header provided
    // Only ENABLE for tradetally.io, disable for everything else
    if (!hostHeader && frontendUrl && !frontendUrl.includes('tradetally.io')) {
      console.log(`[BILLING] Disabled for frontend URL: ${frontendUrl} (not tradetally.io)`);
      return false;
    }

    // Fallback to database config. instance_config.billing_enabled is set at
    // install time and never written by application code, so memoize the read
    // briefly - this is called inside getUserTier/hasFeatureAccess and was
    // issuing a SELECT per call on SaaS deployments with no env override.
    const now = Date.now();
    if (this._billingDbCache && this._billingDbCache.expiresAt > now) {
      return this._billingDbCache.value;
    }

    const query = `SELECT value FROM instance_config WHERE key = 'billing_enabled'`;
    const result = await db.query(query);

    const value = result.rows[0] ? result.rows[0].value : undefined;

    // Handle JSONB, string, and boolean values
    let enabled;
    if (typeof value === 'boolean') enabled = value;
    else if (typeof value === 'string') enabled = value === 'true';
    else if (value === null || value === undefined) enabled = false;
    else enabled = value === true || value === 'true'; // JSONB stored as object

    this._billingDbCache = { value: enabled, expiresAt: now + 60 * 1000 };
    return enabled;
  }

  // Get effective tier for a user. Results are memoized briefly (see
  // services/tierCache.js) because this runs on nearly every market-data
  // request; tier-changing writes call invalidateTierCache below.
  static async getUserTier(userId, hostHeader = null) {
    return tierCache.getOrLoad(userId, hostHeader, () => this._fetchUserTier(userId, hostHeader));
  }

  // Drop memoized tier entries for a user after any tier-changing write
  // (users.tier, tier_overrides, subscriptions).
  static invalidateTierCache(userId) {
    tierCache.invalidate(userId);
  }

  // Uncached tier lookup (optimized: single query when possible)
  static async _fetchUserTier(userId, hostHeader = null) {
    // If billing is disabled (self-hosted), always return 'pro'
    const billingEnabled = await this.isBillingEnabled(hostHeader);
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
  static async getUserTierWithBillingStatus(userId, hostHeader = null) {
    const billingEnabled = await this.isBillingEnabled(hostHeader);
    if (!billingEnabled) {
      return { tier: 'pro', billingEnabled: false };
    }

    const tier = await this.getUserTier(userId, hostHeader);
    return { tier, billingEnabled: true };
  }

  // Check if user has access to a specific feature
  static async hasFeatureAccess(userId, featureKey, hostHeader = null) {
    // If billing is disabled (self-hosted), grant all features
    const billingEnabled = await this.isBillingEnabled(hostHeader);
    if (!billingEnabled) {
      return true;
    }

    // Get feature requirements from the memoized features table (tiny,
    // near-static; invalidated on upsert/toggle and self-healing via TTL)
    const features = await this._getFeatureMap();
    const feature = features.get(featureKey);

    // If feature doesn't exist or is inactive, deny access
    if (!feature || !feature.is_active) {
      return false;
    }

    const requiredTier = feature.required_tier;
    
    // If feature is free tier, everyone has access
    if (requiredTier === 'free') {
      return true;
    }

    // Check user's tier
    const userTier = await this.getUserTier(userId, hostHeader);
    return userTier === 'pro';
  }

  // Get all available features (memoized - the table is tiny and only
  // changes through upsertFeature/toggleFeature, which invalidate)
  static async getAllFeatures() {
    const now = Date.now();
    if (this._featuresCache && this._featuresCache.expiresAt > now) {
      return this._featuresCache.rows;
    }

    const query = `
      SELECT feature_key, feature_name, description, required_tier, is_active
      FROM features
      ORDER BY required_tier, feature_name
    `;
    const result = await db.query(query);
    this._featuresCache = { rows: result.rows, expiresAt: now + 60 * 1000 };
    return result.rows;
  }

  // Features keyed by feature_key, built on the same memo as getAllFeatures
  static async _getFeatureMap() {
    const rows = await this.getAllFeatures();
    return new Map(rows.map(row => [row.feature_key, row]));
  }

  static invalidateFeaturesCache() {
    this._featuresCache = null;
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
    this.invalidateFeaturesCache();
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
    this.invalidateFeaturesCache();
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

    // Subscription status feeds directly into getUserTier - drop memoized entries
    this.invalidateTierCache(userId);

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

  // ---------------------------------------------------------------------------
  // Broker sync access (Pro feature)
  //
  // Broker sync is Pro-only. Without billing (self-hosted) everyone is 'pro',
  // so these all allow. On cloud, free users are gated: they cannot create new
  // connections, and existing connections keep syncing only until the grace
  // cutoff (BROKER_SYNC_ACCESS.graceEndsAt) to avoid rug-pulling early users.
  // ---------------------------------------------------------------------------

  static _brokerSyncGraceEndsAt() {
    return new Date(BROKER_SYNC_ACCESS.graceEndsAt);
  }

  // Can the user connect a NEW broker? Pro-only, no grace period on creation.
  static async canCreateBrokerConnection(userId, hostHeader = null) {
    const billingEnabled = await this.isBillingEnabled(hostHeader);
    if (!billingEnabled) {
      return { allowed: true };
    }

    const tier = await this.getUserTier(userId, hostHeader);
    if (tier === 'pro') {
      return { allowed: true, tier };
    }

    return {
      allowed: false,
      tier,
      code: 'PRO_FEATURE_REQUIRED',
      feature: 'broker_sync',
      requiredTier: 'pro',
      message: 'Broker sync is a Pro feature. Upgrade to Pro to connect your brokerage and import trades automatically.'
    };
  }

  // Can the user SYNC an existing connection? Pro-only, but free users with an
  // existing connection keep syncing until the grace cutoff.
  static async canSyncBrokerConnection(userId, hostHeader = null) {
    const billingEnabled = await this.isBillingEnabled(hostHeader);
    if (!billingEnabled) {
      return { allowed: true };
    }

    const tier = await this.getUserTier(userId, hostHeader);
    if (tier === 'pro') {
      return { allowed: true, tier };
    }

    const graceEndsAt = this._brokerSyncGraceEndsAt();
    const inGracePeriod = new Date() < graceEndsAt;

    if (inGracePeriod) {
      return { allowed: true, tier, inGracePeriod: true, graceEndsAt: graceEndsAt.toISOString() };
    }

    return {
      allowed: false,
      tier,
      inGracePeriod: false,
      graceEndsAt: graceEndsAt.toISOString(),
      code: 'PRO_FEATURE_REQUIRED',
      feature: 'broker_sync',
      requiredTier: 'pro',
      message: 'Broker sync is now a Pro feature. Upgrade to Pro to resume automatic syncing, or use CSV import.'
    };
  }

  // Combined broker-sync access status for the frontend (drives gating + grace banner).
  static async getBrokerSyncAccess(userId, hostHeader = null) {
    const billingEnabled = await this.isBillingEnabled(hostHeader);
    if (!billingEnabled) {
      return {
        isPro: true,
        billingEnabled: false,
        canCreate: true,
        canSync: true,
        inGracePeriod: false,
        graceEndsAt: null
      };
    }

    const tier = await this.getUserTier(userId, hostHeader);
    const isPro = tier === 'pro';
    const graceEndsAt = this._brokerSyncGraceEndsAt();
    const inGracePeriod = !isPro && new Date() < graceEndsAt;

    return {
      isPro,
      billingEnabled: true,
      canCreate: isPro,
      canSync: isPro || inGracePeriod,
      inGracePeriod,
      graceEndsAt: graceEndsAt.toISOString()
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
          'Automatic broker sync (IBKR, Schwab, TradeStation, Alpaca)',
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
  /**
   * Set a user's tier directly (used by Apple IAP verification).
   * Updates the base tier and creates/updates a tier override.
   */
  static async setUserTier(userId, tier, reason, dbClient = null) {
    if (dbClient) {
      await dbClient.query(
        'UPDATE users SET tier = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [tier, userId]
      );
      await dbClient.query(`
        INSERT INTO tier_overrides (user_id, tier, reason, expires_at, created_by)
        VALUES ($1, $2, $3, NULL, NULL)
        ON CONFLICT (user_id) DO UPDATE SET
          tier = EXCLUDED.tier,
          reason = EXCLUDED.reason,
          expires_at = NULL,
          created_by = NULL,
          updated_at = CURRENT_TIMESTAMP
      `, [userId, tier, reason]);
      return;
    }

    await User.updateTier(userId, tier);
    // Create a permanent tier override (no expiry) so getUserTier picks it up
    await User.createTierOverride(userId, tier, reason, null, null);
    this.invalidateTierCache(userId);
    console.log(`[SUCCESS] TierService: Set user ${userId} to tier '${tier}' (${reason})`);
  }
}

module.exports = TierService;
