const db = require('../config/database');
const TierService = require('./tierService');

/**
 * AI Credit Service
 * Manages credit allocation, tracking, and usage for AI features.
 * Self-hosted instances (billing disabled) bypass credit checks.
 */
class AICreditService {
  // Credit costs for different actions
  static CREDIT_COSTS = {
    NEW_SESSION: 10,    // Starting a new AI analysis session
    FOLLOWUP: 2         // Each follow-up question
  };

  // Default monthly allocation for Pro users
  static DEFAULT_ALLOCATION = 100;

  /**
   * Check if billing is disabled (self-hosted mode)
   * Self-hosted users have unlimited AI access since they provide their own API keys
   * @returns {Promise<boolean>}
   */
  static async isBillingDisabled() {
    const billingEnabled = await TierService.isBillingEnabled();
    return !billingEnabled;
  }

  /**
   * Get or create credit record for current billing period
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Credit record with allocated, used, remaining, period_end
   */
  static async getCredits(userId) {
    // Check if billing is disabled (self-hosted)
    if (await this.isBillingDisabled()) {
      console.log('[AI_CREDITS] Billing disabled - returning unlimited credits');
      return {
        allocated: null, // null = unlimited
        used: 0,
        remaining: null,
        period_start: null,
        period_end: null,
        unlimited: true
      };
    }

    // Check user tier - only Pro users get credits
    const tier = await TierService.getUserTier(userId);
    if (tier !== 'pro') {
      console.log(`[AI_CREDITS] User ${userId} is on ${tier} tier - no AI credits`);
      return {
        allocated: 0,
        used: 0,
        remaining: 0,
        period_start: null,
        period_end: null,
        unlimited: false,
        tier_restricted: true
      };
    }

    // Get current period boundaries (first and last day of current month)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of month

    // Try to get existing credit record for this period
    const existingQuery = `
      SELECT id, credits_allocated, credits_used, period_start, period_end
      FROM ai_credits
      WHERE user_id = $1 AND period_start = $2
    `;

    let result = await db.query(existingQuery, [userId, periodStart.toISOString().split('T')[0]]);

    if (result.rows.length === 0) {
      // Create new credit record for this period
      console.log(`[AI_CREDITS] Creating new credit allocation for user ${userId}`);
      const insertQuery = `
        INSERT INTO ai_credits (user_id, credits_allocated, credits_used, period_start, period_end)
        VALUES ($1, $2, 0, $3, $4)
        RETURNING id, credits_allocated, credits_used, period_start, period_end
      `;
      result = await db.query(insertQuery, [
        userId,
        this.DEFAULT_ALLOCATION,
        periodStart.toISOString().split('T')[0],
        periodEnd.toISOString().split('T')[0]
      ]);
    }

    const record = result.rows[0];
    return {
      allocated: record.credits_allocated,
      used: record.credits_used,
      remaining: record.credits_allocated - record.credits_used,
      period_start: record.period_start,
      period_end: record.period_end,
      unlimited: false
    };
  }

  /**
   * Check if user has enough credits for an action
   * @param {string} userId - User ID
   * @param {number} amount - Credits needed
   * @returns {Promise<Object>} { allowed: boolean, remaining: number|null, message?: string }
   */
  static async hasCredits(userId, amount) {
    // Self-hosted users always have credits
    if (await this.isBillingDisabled()) {
      return {
        allowed: true,
        remaining: null,
        unlimited: true
      };
    }

    const credits = await this.getCredits(userId);

    // Handle tier restriction
    if (credits.tier_restricted) {
      return {
        allowed: false,
        remaining: 0,
        message: 'AI features require a Pro subscription'
      };
    }

    const hasEnough = credits.remaining >= amount;

    return {
      allowed: hasEnough,
      remaining: credits.remaining,
      needed: amount,
      message: hasEnough ? null : `Insufficient credits. You have ${credits.remaining} credits, but this action requires ${amount}.`
    };
  }

  /**
   * Deduct credits after successful AI operation
   * @param {string} userId - User ID
   * @param {number} amount - Credits to deduct
   * @returns {Promise<Object>} Updated credit record
   */
  static async useCredits(userId, amount) {
    // Self-hosted users don't track credits
    if (await this.isBillingDisabled()) {
      console.log('[AI_CREDITS] Billing disabled - skipping credit deduction');
      return {
        allocated: null,
        used: 0,
        remaining: null,
        unlimited: true,
        deducted: amount
      };
    }

    const credits = await this.getCredits(userId);

    // Don't deduct if tier restricted
    if (credits.tier_restricted) {
      throw new Error('AI features require a Pro subscription');
    }

    // Verify sufficient credits
    if (credits.remaining < amount) {
      throw new Error(`Insufficient credits. You have ${credits.remaining} credits, but this action requires ${amount}.`);
    }

    // Get current period start
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Deduct credits
    const updateQuery = `
      UPDATE ai_credits
      SET credits_used = credits_used + $1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND period_start = $3
      RETURNING credits_allocated, credits_used
    `;

    const result = await db.query(updateQuery, [
      amount,
      userId,
      periodStart.toISOString().split('T')[0]
    ]);

    if (result.rows.length === 0) {
      throw new Error('Failed to update credits');
    }

    const record = result.rows[0];
    console.log(`[AI_CREDITS] Deducted ${amount} credits from user ${userId}. Remaining: ${record.credits_allocated - record.credits_used}`);

    return {
      allocated: record.credits_allocated,
      used: record.credits_used,
      remaining: record.credits_allocated - record.credits_used,
      deducted: amount,
      unlimited: false
    };
  }

  /**
   * Get credit cost for a specific action
   * @param {string} action - Action type (NEW_SESSION, FOLLOWUP)
   * @returns {number} Credit cost
   */
  static getCost(action) {
    return this.CREDIT_COSTS[action] || 0;
  }

  /**
   * Reset credits for a user (admin function)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated credit record
   */
  static async resetCredits(userId) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const updateQuery = `
      UPDATE ai_credits
      SET credits_used = 0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND period_start = $2
      RETURNING credits_allocated, credits_used
    `;

    const result = await db.query(updateQuery, [
      userId,
      periodStart.toISOString().split('T')[0]
    ]);

    if (result.rows.length === 0) {
      // No record exists, create fresh one
      return this.getCredits(userId);
    }

    console.log(`[AI_CREDITS] Reset credits for user ${userId}`);
    return {
      allocated: result.rows[0].credits_allocated,
      used: 0,
      remaining: result.rows[0].credits_allocated
    };
  }

  /**
   * Get credit usage history for a user
   * @param {string} userId - User ID
   * @param {number} limit - Number of periods to return
   * @returns {Promise<Array>} Array of credit records
   */
  static async getCreditHistory(userId, limit = 6) {
    const query = `
      SELECT credits_allocated, credits_used, period_start, period_end
      FROM ai_credits
      WHERE user_id = $1
      ORDER BY period_start DESC
      LIMIT $2
    `;

    const result = await db.query(query, [userId, limit]);

    return result.rows.map(row => ({
      allocated: row.credits_allocated,
      used: row.credits_used,
      remaining: row.credits_allocated - row.credits_used,
      period_start: row.period_start,
      period_end: row.period_end
    }));
  }
}

module.exports = AICreditService;
