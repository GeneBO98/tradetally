const db = require('../config/database');
const TierService = require('./tierService');

// Rate limit configuration
const RATE_LIMITS = {
  free: {
    quote: 200,         // 200 quote calls per day
    candle: 200         // 200 candle calls per day
  },
  pro: {
    quote: Infinity,    // Unlimited for Pro users
    candle: Infinity    // Unlimited for Pro users
  }
};

class ApiUsageService {
  /**
   * Check if user can make API call based on their tier and current usage
   * @param {number} userId - User ID
   * @param {string} endpointType - Type of endpoint (quote, candle, indicator, pattern, support_resistance)
   * @param {string} userTier - User's tier (free or pro)
   * @returns {Promise<{allowed: boolean, remaining: number, resetAt: Date, message?: string}>}
   */
  static async checkLimit(userId, endpointType, userTier) {
    try {
      // If billing is disabled (self-hosted), allow all requests
      const billingEnabled = await TierService.isBillingEnabled();
      if (!billingEnabled) {
        return {
          allowed: true,
          remaining: Infinity,
          resetAt: null,
          message: 'Unlimited (billing disabled)'
        };
      }

      // Pro users have unlimited access to everything
      if (userTier === 'pro') {
        return {
          allowed: true,
          remaining: Infinity,
          resetAt: null,
          message: 'Unlimited (Pro tier)'
        };
      }

      // Premium endpoints (indicator, pattern, support_resistance) are Pro-only
      if (['indicator', 'pattern', 'support_resistance'].includes(endpointType)) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: null,
          message: 'This feature requires a Pro subscription',
          upgradeRequired: true
        };
      }

      // For free users on rate-limited endpoints (quote, candle)
      const limit = RATE_LIMITS.free[endpointType];

      if (!limit) {
        // Endpoint type not configured for rate limiting - allow
        return {
          allowed: true,
          remaining: Infinity,
          resetAt: null
        };
      }

      // Get current usage
      const usage = await this.getUserUsage(userId, endpointType);
      const currentCount = usage.callCount || 0;
      const remaining = Math.max(0, limit - currentCount);

      if (currentCount >= limit) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: usage.resetAt,
          message: `Daily limit of ${limit} ${endpointType} calls reached. Resets at ${usage.resetAt.toISOString()}`,
          limitExceeded: true
        };
      }

      return {
        allowed: true,
        remaining: remaining,
        resetAt: usage.resetAt
      };
    } catch (error) {
      console.error('[API USAGE] Error checking limit:', error);
      // On error, allow the request but log it
      return {
        allowed: true,
        remaining: null,
        resetAt: null,
        error: error.message
      };
    }
  }

  /**
   * Track an API call for a user
   * @param {number} userId - User ID
   * @param {string} endpointType - Type of endpoint
   * @returns {Promise<{callCount: number, remaining: number, resetAt: Date}>}
   */
  static async trackApiCall(userId, endpointType) {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const query = `
        INSERT INTO api_usage_tracking (user_id, endpoint_type, call_count, usage_date, reset_at)
        VALUES ($1, $2, 1, $3, $4)
        ON CONFLICT (user_id, endpoint_type, usage_date)
        DO UPDATE SET
          call_count = api_usage_tracking.call_count + 1,
          updated_at = CURRENT_TIMESTAMP
        RETURNING call_count, reset_at
      `;

      const result = await db.query(query, [userId, endpointType, today, tomorrow]);
      const { call_count, reset_at } = result.rows[0];

      // Get user tier to calculate remaining
      const userTier = await TierService.getUserTier(userId);
      const limit = RATE_LIMITS[userTier]?.[endpointType] || RATE_LIMITS.free[endpointType] || Infinity;
      const remaining = limit === Infinity ? Infinity : Math.max(0, limit - call_count);

      return {
        callCount: call_count,
        remaining: remaining,
        resetAt: reset_at
      };
    } catch (error) {
      console.error('[API USAGE] Error tracking API call:', error);
      throw error;
    }
  }

  /**
   * Get current usage for a user and endpoint type
   * @param {number} userId - User ID
   * @param {string} endpointType - Type of endpoint
   * @returns {Promise<{callCount: number, resetAt: Date}>}
   */
  static async getUserUsage(userId, endpointType) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const query = `
        SELECT call_count, reset_at
        FROM api_usage_tracking
        WHERE user_id = $1 AND endpoint_type = $2 AND usage_date = $3
      `;

      const result = await db.query(query, [userId, endpointType, today]);

      if (result.rows.length === 0) {
        // No usage yet today
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        return {
          callCount: 0,
          resetAt: tomorrow
        };
      }

      return {
        callCount: result.rows[0].call_count,
        resetAt: new Date(result.rows[0].reset_at)
      };
    } catch (error) {
      console.error('[API USAGE] Error getting user usage:', error);
      throw error;
    }
  }

  /**
   * Get all usage stats for a user
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Usage statistics for all endpoint types
   */
  static async getAllUserUsage(userId) {
    try {
      const userTier = await TierService.getUserTier(userId);
      const billingEnabled = await TierService.isBillingEnabled();

      if (!billingEnabled || userTier === 'pro') {
        return {
          tier: userTier,
          billingEnabled: billingEnabled,
          unlimited: true,
          endpoints: {
            quote: { limit: 'Unlimited', used: 0, remaining: 'Unlimited' },
            candle: { limit: 'Unlimited', used: 0, remaining: 'Unlimited' },
            indicator: { access: 'Full Access' },
            pattern: { access: 'Full Access' },
            support_resistance: { access: 'Full Access' }
          }
        };
      }

      // Free tier user - get actual usage
      const today = new Date().toISOString().split('T')[0];
      const query = `
        SELECT endpoint_type, call_count, reset_at
        FROM api_usage_tracking
        WHERE user_id = $1 AND usage_date = $2
      `;

      const result = await db.query(query, [userId, today]);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const usage = {
        tier: userTier,
        billingEnabled: billingEnabled,
        unlimited: false,
        endpoints: {
          quote: {
            limit: RATE_LIMITS.free.quote,
            used: 0,
            remaining: RATE_LIMITS.free.quote,
            resetAt: tomorrow
          },
          candle: {
            limit: RATE_LIMITS.free.candle,
            used: 0,
            remaining: RATE_LIMITS.free.candle,
            resetAt: tomorrow
          },
          indicator: { access: 'Pro Only', upgradeRequired: true },
          pattern: { access: 'Pro Only', upgradeRequired: true },
          support_resistance: { access: 'Pro Only', upgradeRequired: true }
        }
      };

      // Fill in actual usage from database
      result.rows.forEach(row => {
        if (usage.endpoints[row.endpoint_type]) {
          usage.endpoints[row.endpoint_type].used = row.call_count;
          usage.endpoints[row.endpoint_type].remaining = Math.max(
            0,
            RATE_LIMITS.free[row.endpoint_type] - row.call_count
          );
          usage.endpoints[row.endpoint_type].resetAt = new Date(row.reset_at);
        }
      });

      return usage;
    } catch (error) {
      console.error('[API USAGE] Error getting all user usage:', error);
      throw error;
    }
  }

  /**
   * Reset daily usage counters (called by background job)
   * @returns {Promise<number>} Number of records deleted
   */
  static async resetDailyUsage() {
    try {
      // Delete records older than 7 days (for historical tracking if needed later)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const query = `
        DELETE FROM api_usage_tracking
        WHERE usage_date < $1
      `;

      const result = await db.query(query, [sevenDaysAgo.toISOString().split('T')[0]]);

      console.log(`[API USAGE] Cleaned up ${result.rowCount} old usage records`);
      return result.rowCount;
    } catch (error) {
      console.error('[API USAGE] Error resetting daily usage:', error);
      throw error;
    }
  }

  /**
   * Get rate limit configuration
   * @returns {Object} Rate limit configuration
   */
  static getRateLimits() {
    return RATE_LIMITS;
  }
}

module.exports = ApiUsageService;
