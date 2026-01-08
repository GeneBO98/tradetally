const ReferralService = require('../services/referralService');

const referralController = {
  /**
   * GET /api/referral/r/:slug
   * Get referral info by slug (public, for landing page)
   */
  async getReferralBySlug(req, res, next) {
    try {
      const { slug } = req.params;

      const referral = await ReferralService.getBySlug(slug);

      if (!referral) {
        return res.status(404).json({ error: 'Referral code not found' });
      }

      // Return only public info
      res.json({
        referral: {
          creator_name: referral.creator_name,
          code: referral.code,
          slug: referral.slug,
          discount_percent: referral.discount_percent
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/referral/track-visit
   * Track a referral link visit
   */
  async trackVisit(req, res, next) {
    try {
      const { slug } = req.body;

      if (!slug) {
        return res.status(400).json({ error: 'Slug is required' });
      }

      const referral = await ReferralService.getBySlug(slug);

      if (!referral) {
        return res.status(404).json({ error: 'Referral code not found' });
      }

      // Get IP and user agent
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
      const userAgent = req.headers['user-agent'];

      const visitId = await ReferralService.trackVisit(referral.id, ipAddress, userAgent);

      res.json({ success: true, visit_id: visitId });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/referral/admin
   * List all referral codes (admin only)
   */
  async getAllCodes(req, res, next) {
    try {
      const { include_inactive, limit, offset } = req.query;

      const codes = await ReferralService.getAllCodes({
        includeInactive: include_inactive === 'true',
        limit: parseInt(limit) || 100,
        offset: parseInt(offset) || 0
      });

      res.json({ referral_codes: codes });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/referral/admin
   * Create a new referral code (admin only)
   */
  async createCode(req, res, next) {
    try {
      const {
        creator_name,
        code,
        slug,
        discount_percent,
        valid_from,
        valid_until,
        contact_email,
        notes
      } = req.body;

      // Validation
      if (!creator_name) {
        return res.status(400).json({ error: 'Creator name is required' });
      }
      if (!discount_percent || discount_percent < 1 || discount_percent > 100) {
        return res.status(400).json({ error: 'Discount percent must be between 1 and 100' });
      }

      // Generate code and slug if not provided
      const finalCode = code || ReferralService.generateCode(creator_name);
      const finalSlug = slug || ReferralService.generateSlug(creator_name);

      // Check for existing code or slug
      const existingCode = await ReferralService.getByCode(finalCode);
      if (existingCode) {
        return res.status(409).json({ error: 'Promo code already exists' });
      }

      const existingSlug = await ReferralService.getBySlug(finalSlug);
      if (existingSlug) {
        return res.status(409).json({ error: 'URL slug already exists' });
      }

      const referral = await ReferralService.createCode(
        {
          creator_name,
          code: finalCode,
          slug: finalSlug,
          discount_percent,
          valid_from,
          valid_until,
          contact_email,
          notes
        },
        req.user.id
      );

      res.status(201).json({ referral });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/referral/admin/analytics
   * Get overall referral analytics (admin only)
   */
  async getOverallAnalytics(req, res, next) {
    try {
      const { start_date, end_date } = req.query;

      const analytics = await ReferralService.getOverallAnalytics({
        startDate: start_date ? new Date(start_date) : null,
        endDate: end_date ? new Date(end_date) : null
      });

      res.json({ analytics });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/referral/admin/:id
   * Get referral code details with analytics (admin only)
   */
  async getCodeDetails(req, res, next) {
    try {
      const { id } = req.params;
      const { start_date, end_date } = req.query;

      const referral = await ReferralService.getById(id);

      if (!referral) {
        return res.status(404).json({ error: 'Referral code not found' });
      }

      const analytics = await ReferralService.getCodeAnalytics(id, {
        startDate: start_date ? new Date(start_date) : null,
        endDate: end_date ? new Date(end_date) : null
      });

      res.json({ referral, analytics });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/referral/admin/:id
   * Update a referral code (admin only)
   */
  async updateCode(req, res, next) {
    try {
      const { id } = req.params;

      const existingCode = await ReferralService.getById(id);
      if (!existingCode) {
        return res.status(404).json({ error: 'Referral code not found' });
      }

      const referral = await ReferralService.updateCode(id, req.body);

      res.json({ referral });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/referral/admin/:id
   * Deactivate a referral code (admin only)
   */
  async deactivateCode(req, res, next) {
    try {
      const { id } = req.params;

      const existingCode = await ReferralService.getById(id);
      if (!existingCode) {
        return res.status(404).json({ error: 'Referral code not found' });
      }

      const referral = await ReferralService.deactivateCode(id);

      res.json({ referral, message: 'Referral code deactivated' });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = referralController;
