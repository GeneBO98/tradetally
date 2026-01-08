const db = require('../config/database');
const TierService = require('./tierService');
const BillingService = require('./billingService');
const crypto = require('crypto');

class ReferralService {
  /**
   * Check if referral system is enabled (only when billing is enabled)
   */
  static async isEnabled() {
    return await TierService.isBillingEnabled();
  }

  /**
   * Create a new referral code with Stripe coupon
   */
  static async createCode(data, createdById) {
    const {
      creator_name,
      code,
      slug,
      discount_percent,
      valid_from,
      valid_until,
      contact_email,
      notes
    } = data;

    // Create Stripe coupon and promotion code
    let stripeCouponId = null;
    let stripePromoCodeId = null;

    try {
      const billingAvailable = await BillingService.isBillingAvailable();
      if (billingAvailable) {
        const stripe = BillingService.getStripe();

        // Create the coupon
        const coupon = await stripe.coupons.create({
          percent_off: discount_percent,
          duration: 'once',
          name: `${creator_name} - ${discount_percent}% off`,
          metadata: {
            creator_name: creator_name,
            referral_slug: slug
          }
        });
        stripeCouponId = coupon.id;

        // Create a promotion code for the coupon (this is what users enter at checkout)
        const promoCode = await stripe.promotionCodes.create({
          coupon: coupon.id,
          code: code.toUpperCase(),
          metadata: {
            creator_name: creator_name,
            referral_slug: slug
          }
        });
        stripePromoCodeId = promoCode.id;

        console.log(`[REFERRAL] Created Stripe coupon ${stripeCouponId} and promo code ${stripePromoCodeId} for ${creator_name}`);
      }
    } catch (error) {
      console.error('[REFERRAL] Error creating Stripe coupon:', error);
      // Continue without Stripe - can be linked later
    }

    const query = `
      INSERT INTO referral_codes (
        creator_name, code, slug, stripe_coupon_id, stripe_promo_code_id,
        discount_percent, valid_from, valid_until, contact_email, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      creator_name,
      code.toUpperCase(),
      slug.toLowerCase(),
      stripeCouponId,
      stripePromoCodeId,
      discount_percent,
      valid_from || new Date(),
      valid_until || null,
      contact_email || null,
      notes || null,
      createdById
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Get referral code by URL slug
   */
  static async getBySlug(slug) {
    const query = `
      SELECT * FROM referral_codes
      WHERE slug = $1 AND is_active = true
        AND (valid_until IS NULL OR valid_until > NOW())
    `;
    const result = await db.query(query, [slug.toLowerCase()]);
    return result.rows[0] || null;
  }

  /**
   * Get referral code by promo code
   */
  static async getByCode(code) {
    const query = `
      SELECT * FROM referral_codes
      WHERE code = $1 AND is_active = true
        AND (valid_until IS NULL OR valid_until > NOW())
    `;
    const result = await db.query(query, [code.toUpperCase()]);
    return result.rows[0] || null;
  }

  /**
   * Get referral code by Stripe coupon ID
   */
  static async getByCouponId(couponId) {
    const query = `
      SELECT * FROM referral_codes
      WHERE stripe_coupon_id = $1
    `;
    const result = await db.query(query, [couponId]);
    return result.rows[0] || null;
  }

  /**
   * Get referral code by ID
   */
  static async getById(id) {
    const query = `SELECT * FROM referral_codes WHERE id = $1`;
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Track a referral link visit
   */
  static async trackVisit(referralCodeId, ipAddress, userAgent) {
    // Hash the IP address for privacy
    const ipHash = ipAddress
      ? crypto.createHash('sha256').update(ipAddress).digest('hex').substring(0, 64)
      : null;

    const query = `
      INSERT INTO referral_visits (referral_code_id, visitor_ip_hash, user_agent)
      VALUES ($1, $2, $3)
      RETURNING id
    `;

    const result = await db.query(query, [referralCodeId, ipHash, userAgent || null]);
    return result.rows[0]?.id;
  }

  /**
   * Record a signup conversion
   */
  static async recordSignup(userId, referralCodeId) {
    const query = `
      INSERT INTO referral_conversions (referral_code_id, user_id, conversion_type)
      VALUES ($1, $2, 'signup')
      ON CONFLICT (referral_code_id, user_id, conversion_type) DO NOTHING
      RETURNING *
    `;

    try {
      const result = await db.query(query, [referralCodeId, userId]);
      if (result.rows[0]) {
        console.log(`[REFERRAL] Recorded signup conversion for user ${userId} from referral ${referralCodeId}`);
      }
      return result.rows[0] || null;
    } catch (error) {
      console.error('[REFERRAL] Error recording signup conversion:', error);
      return null;
    }
  }

  /**
   * Record a subscription conversion
   */
  static async recordSubscription(userId, referralCodeId) {
    const query = `
      INSERT INTO referral_conversions (referral_code_id, user_id, conversion_type)
      VALUES ($1, $2, 'subscription')
      ON CONFLICT (referral_code_id, user_id, conversion_type) DO NOTHING
      RETURNING *
    `;

    try {
      const result = await db.query(query, [referralCodeId, userId]);
      if (result.rows[0]) {
        console.log(`[REFERRAL] Recorded subscription conversion for user ${userId} from referral ${referralCodeId}`);
      }
      return result.rows[0] || null;
    } catch (error) {
      console.error('[REFERRAL] Error recording subscription conversion:', error);
      return null;
    }
  }

  /**
   * Get all referral codes (admin)
   */
  static async getAllCodes(options = {}) {
    const { includeInactive = false, limit = 100, offset = 0 } = options;

    let query = `
      SELECT
        rc.*,
        u.username as created_by_username,
        (SELECT COUNT(*) FROM referral_visits WHERE referral_code_id = rc.id) as visit_count,
        (SELECT COUNT(*) FROM referral_conversions WHERE referral_code_id = rc.id AND conversion_type = 'signup') as signup_count,
        (SELECT COUNT(*) FROM referral_conversions WHERE referral_code_id = rc.id AND conversion_type = 'subscription') as subscription_count
      FROM referral_codes rc
      LEFT JOIN users u ON rc.created_by = u.id
    `;

    if (!includeInactive) {
      query += ` WHERE rc.is_active = true`;
    }

    query += ` ORDER BY rc.created_at DESC LIMIT $1 OFFSET $2`;

    const result = await db.query(query, [limit, offset]);
    return result.rows;
  }

  /**
   * Get analytics for a specific referral code
   */
  static async getCodeAnalytics(referralCodeId, dateRange = {}) {
    const { startDate, endDate } = dateRange;

    let dateFilter = '';
    const params = [referralCodeId];

    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND created_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND created_at <= $${params.length}`;
    }

    // Get visit counts by day
    const visitsQuery = `
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM referral_visits
      WHERE referral_code_id = $1 ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date
    `;
    const visitsResult = await db.query(visitsQuery, params);

    // Get conversion counts
    const conversionsQuery = `
      SELECT conversion_type, COUNT(*) as count
      FROM referral_conversions
      WHERE referral_code_id = $1 ${dateFilter}
      GROUP BY conversion_type
    `;
    const conversionsResult = await db.query(conversionsQuery, params);

    // Get totals
    const totalsQuery = `
      SELECT
        (SELECT COUNT(*) FROM referral_visits WHERE referral_code_id = $1 ${dateFilter}) as total_visits,
        (SELECT COUNT(*) FROM referral_conversions WHERE referral_code_id = $1 AND conversion_type = 'signup' ${dateFilter}) as total_signups,
        (SELECT COUNT(*) FROM referral_conversions WHERE referral_code_id = $1 AND conversion_type = 'subscription' ${dateFilter}) as total_subscriptions
    `;
    const totalsResult = await db.query(totalsQuery, params);

    const totals = totalsResult.rows[0];
    const visitToSignupRate = totals.total_visits > 0
      ? ((totals.total_signups / totals.total_visits) * 100).toFixed(2)
      : 0;
    const signupToSubscriptionRate = totals.total_signups > 0
      ? ((totals.total_subscriptions / totals.total_signups) * 100).toFixed(2)
      : 0;

    return {
      visits_by_day: visitsResult.rows,
      conversions_by_type: conversionsResult.rows,
      totals: {
        visits: parseInt(totals.total_visits),
        signups: parseInt(totals.total_signups),
        subscriptions: parseInt(totals.total_subscriptions),
        visit_to_signup_rate: parseFloat(visitToSignupRate),
        signup_to_subscription_rate: parseFloat(signupToSubscriptionRate)
      }
    };
  }

  /**
   * Get overall referral analytics (admin dashboard)
   */
  static async getOverallAnalytics(dateRange = {}) {
    const { startDate, endDate } = dateRange;

    let dateFilter = '';
    const params = [];

    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND created_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND created_at <= $${params.length}`;
    }

    // Overall totals
    const totalsQuery = `
      SELECT
        (SELECT COUNT(*) FROM referral_codes WHERE is_active = true) as active_codes,
        (SELECT COUNT(*) FROM referral_visits WHERE 1=1 ${dateFilter}) as total_visits,
        (SELECT COUNT(*) FROM referral_conversions WHERE conversion_type = 'signup' ${dateFilter.replace(/created_at/g, 'created_at')}) as total_signups,
        (SELECT COUNT(*) FROM referral_conversions WHERE conversion_type = 'subscription' ${dateFilter.replace(/created_at/g, 'created_at')}) as total_subscriptions
    `;
    const totalsResult = await db.query(totalsQuery, params);

    // Top performing codes
    const topCodesQuery = `
      SELECT
        rc.id,
        rc.creator_name,
        rc.code,
        rc.slug,
        rc.discount_percent,
        COUNT(DISTINCT rv.id) as visits,
        COUNT(DISTINCT CASE WHEN rconv.conversion_type = 'signup' THEN rconv.id END) as signups,
        COUNT(DISTINCT CASE WHEN rconv.conversion_type = 'subscription' THEN rconv.id END) as subscriptions
      FROM referral_codes rc
      LEFT JOIN referral_visits rv ON rc.id = rv.referral_code_id
      LEFT JOIN referral_conversions rconv ON rc.id = rconv.referral_code_id
      WHERE rc.is_active = true
      GROUP BY rc.id
      ORDER BY subscriptions DESC, signups DESC, visits DESC
      LIMIT 10
    `;
    const topCodesResult = await db.query(topCodesQuery);

    // Visits over time (last 30 days)
    const visitsOverTimeQuery = `
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM referral_visits
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `;
    const visitsOverTimeResult = await db.query(visitsOverTimeQuery);

    const totals = totalsResult.rows[0];

    return {
      totals: {
        active_codes: parseInt(totals.active_codes),
        visits: parseInt(totals.total_visits),
        signups: parseInt(totals.total_signups),
        subscriptions: parseInt(totals.total_subscriptions)
      },
      top_codes: topCodesResult.rows,
      visits_over_time: visitsOverTimeResult.rows
    };
  }

  /**
   * Update a referral code
   */
  static async updateCode(id, data) {
    const allowedFields = [
      'creator_name',
      'discount_percent',
      'is_active',
      'valid_until',
      'contact_email',
      'notes'
    ];

    const updates = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return await this.getById(id);
    }

    values.push(id);
    const query = `
      UPDATE referral_codes
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Deactivate a referral code
   */
  static async deactivateCode(id) {
    const query = `
      UPDATE referral_codes
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [id]);

    // Also deactivate the Stripe promotion code if it exists
    const code = result.rows[0];
    if (code?.stripe_promo_code_id) {
      try {
        const billingAvailable = await BillingService.isBillingAvailable();
        if (billingAvailable) {
          const stripe = BillingService.getStripe();
          await stripe.promotionCodes.update(code.stripe_promo_code_id, {
            active: false
          });
          console.log(`[REFERRAL] Deactivated Stripe promo code ${code.stripe_promo_code_id}`);
        }
      } catch (error) {
        console.error('[REFERRAL] Error deactivating Stripe promo code:', error);
      }
    }

    return code;
  }

  /**
   * Get referral code for a user (if they were referred)
   */
  static async getUserReferral(userId) {
    const query = `
      SELECT rc.*
      FROM users u
      JOIN referral_codes rc ON u.referred_by_code = rc.id
      WHERE u.id = $1
    `;
    const result = await db.query(query, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Generate a unique slug from creator name
   */
  static generateSlug(creatorName) {
    return creatorName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Generate a unique promo code
   */
  static generateCode(creatorName) {
    const prefix = creatorName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 8);
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${suffix}`;
  }
}

module.exports = ReferralService;
