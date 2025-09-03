const BillingService = require('../services/billingService');
const TierService = require('../services/tierService');
const User = require('../models/User');
const db = require('../config/database');

const billingController = {
  
  // Get billing status
  async getBillingStatus(req, res, next) {
    try {
      const billingEnabled = await TierService.isBillingEnabled(req.headers.host);
      const billingAvailable = await BillingService.isBillingAvailable();
      
      // Add detailed debugging info
      console.log('Billing status debug:', {
        billingEnabled,
        billingAvailable,
        host: req.headers.host,
        frontendUrl: process.env.FRONTEND_URL,
        billingEnabledEnv: process.env.BILLING_ENABLED,
        stripeSecretKey: process.env.STRIPE_SECRET_KEY ? 'present' : 'missing'
      });
      
      res.json({
        success: true,
        data: {
          billing_enabled: billingEnabled,
          billing_available: billingAvailable
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user subscription details
  async getSubscription(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Add debugging info
      console.log('getSubscription debug:', {
        userId,
        userAgent: req.headers['user-agent'],
        host: req.headers.host
      });
      
      const subscription = await BillingService.getSubscriptionDetails(userId);
      const userTier = await TierService.getUserTier(userId);
      const tierOverride = await User.getTierOverride(userId);
      
      console.log('Subscription details:', {
        subscription: subscription ? 'exists' : 'null',
        userTier,
        tierOverride: tierOverride ? 'exists' : 'null'
      });
      
      // Check if user has an active trial
      let trial = null;
      if (tierOverride && tierOverride.reason && tierOverride.reason.includes('trial')) {
        const isActive = !tierOverride.expires_at || new Date(tierOverride.expires_at) > new Date();
        trial = {
          active: isActive,
          expires_at: tierOverride.expires_at,
          reason: tierOverride.reason,
          days_remaining: tierOverride.expires_at ? 
            Math.max(0, Math.ceil((new Date(tierOverride.expires_at) - new Date()) / (1000 * 60 * 60 * 24))) : 0
        };
      }
      
      res.json({
        success: true,
        data: {
          subscription,
          tier: userTier,
          isOnTrial: trial ? trial.active : false,
          trialEndsAt: trial ? trial.expires_at : null,
          trial, // Keep for backward compatibility with web
          has_used_trial: !!tierOverride
        }
      });
    } catch (error) {
      console.error('Error fetching subscription:', error);
      if (error.message === 'Billing not available') {
        return res.status(400).json({
          error: 'billing_unavailable',
          message: 'Billing is not enabled on this instance'
        });
      }
      next(error);
    }
  },

  // Get available pricing plans
  async getPricingPlans(req, res, next) {
    try {
      // Add debugging info
      const billingEnabled = await TierService.isBillingEnabled(req.headers.host);
      const billingAvailable = await BillingService.isBillingAvailable();
      
      console.log('getPricingPlans debug:', {
        billingEnabled,
        billingAvailable,
        host: req.headers.host,
        userAgent: req.headers['user-agent']
      });
      
      const plans = await BillingService.getPricingPlans();
      
      console.log('Retrieved pricing plans:', plans.length, 'plans');
      
      res.json({
        success: true,
        data: plans, // Web app expects 'data'
        plans: plans // Mobile app expects 'plans' - provide both for compatibility
      });
    } catch (error) {
      console.error('Error fetching pricing plans:', error);
      if (error.message === 'Billing not available') {
        return res.status(400).json({
          error: 'billing_unavailable',
          message: 'Billing is not enabled on this instance'
        });
      }
      next(error);
    }
  },

  // Create checkout session
  async createCheckoutSession(req, res, next) {
    try {
      const userId = req.user.id;
      const { priceId, redirectUrl } = req.body;
      
      if (!priceId) {
        return res.status(400).json({
          error: 'missing_price_id',
          message: 'Price ID is required'
        });
      }

      // Get base URL for redirect URLs
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      
      // Include redirect URL in success URL if provided
      let successUrl = `${frontendUrl}/billing?session_id={CHECKOUT_SESSION_ID}`;
      if (redirectUrl) {
        successUrl += `&redirect=${encodeURIComponent(redirectUrl)}`;
      }
      
      const cancelUrl = `${frontendUrl}/pricing`;

      const session = await BillingService.createCheckoutSession(
        userId,
        priceId,
        successUrl,
        cancelUrl
      );

      res.json({
        success: true,
        session: {
          sessionId: session.id,
          url: session.url
        }
      });
    } catch (error) {
      console.error('Error creating checkout session:', error);
      if (error.message === 'Billing not available') {
        return res.status(400).json({
          error: 'billing_unavailable',
          message: 'Billing is not enabled on this instance'
        });
      }
      next(error);
    }
  },

  // Start 14-day trial
  async startTrial(req, res, next) {
    let client;
    try {
      const userId = req.user.id;
      console.log('🔍 Starting trial request for user:', userId);
      
      // Use a transaction to make this atomic and prevent race conditions
      try {
        client = await db.connect();
      } catch (dbError) {
        console.error('❌ Failed to connect to database:', dbError);
        throw new Error('Database connection failed');
      }
      
      try {
        await client.query('BEGIN');
        
        // Check if user has a trial_used flag or any current trial override
        // Use a subquery to avoid GROUP BY with FOR UPDATE conflict
        const userTrialStatusQuery = `
          SELECT 
            u.id,
            u.trial_used,
            (SELECT COUNT(*) FROM tier_overrides to_ 
             WHERE to_.user_id = u.id AND to_.reason ILIKE '%trial%') as active_trial_count
          FROM users u
          WHERE u.id = $1
          FOR UPDATE
        `;
        
        console.log('🔍 Checking user trial status...');
        const trialStatusResult = await client.query(userTrialStatusQuery, [userId]);
        
        if (trialStatusResult.rows.length === 0) {
          console.log('❌ User not found:', userId);
          await client.query('ROLLBACK');
          return res.status(404).json({
            error: 'user_not_found',
            message: 'User not found'
          });
        }
        
        const userTrialStatus = trialStatusResult.rows[0];
        const hasUsedTrial = userTrialStatus.trial_used || parseInt(userTrialStatus.active_trial_count) > 0;
        
        console.log('🔍 User trial status:', {
          userId,
          trial_used: userTrialStatus.trial_used,
          active_trial_count: userTrialStatus.active_trial_count,
          hasUsedTrial
        });
        
        if (hasUsedTrial) {
          console.log('❌ User has already used trial:', userId);
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'trial_already_used',
            message: 'You have already used your free trial'
          });
        }
        
        console.log('✅ No existing trial override found, creating new trial for user:', userId);

        // Check if user already has a subscription
        let subscription;
        try {
          subscription = await User.getSubscription(userId);
          console.log('🔍 User subscription check:', subscription ? 'has subscription' : 'no subscription');
        } catch (subError) {
          console.error('❌ Error checking subscription:', subError);
          await client.query('ROLLBACK');
          throw new Error('Failed to check subscription status');
        }
        
        if (subscription && subscription.status === 'active') {
          console.log('❌ User already has active subscription:', userId);
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'already_subscribed',
            message: 'You already have an active subscription'
          });
        }

        // Create 14-day trial tier override
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 14);

        const insertQuery = `
          INSERT INTO tier_overrides (user_id, tier, reason, expires_at, created_by)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;
        const insertResult = await client.query(insertQuery, [userId, 'pro', 'Free 14-day trial', expiresAt, null]);
        
        // Update trial_used flag (trigger will also do this, but we'll do it explicitly for clarity)
        await client.query(`UPDATE users SET trial_used = true WHERE id = $1`, [userId]);
        console.log('✅ Updated trial_used flag');
        
        await client.query('COMMIT');
        console.log('✅ Trial created successfully for user:', userId, 'Trial ID:', insertResult.rows[0].id);

        res.json({
          success: true,
          message: 'Free trial started successfully',
          trial_expires_at: expiresAt
        });
      } catch (txError) {
        await client.query('ROLLBACK');
        console.error('❌ Transaction error in startTrial:', txError);
        throw txError;
      } finally {
        if (client) {
          client.release();
        }
      }
    } catch (error) {
      console.error('❌ Error starting trial for user:', req.user?.id, error);
      if (client) {
        try {
          client.release();
        } catch (releaseError) {
          console.error('❌ Error releasing client:', releaseError);
        }
      }
      next(error);
    }
  },

  // Create customer portal session
  async createPortalSession(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Get base URL for return URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const returnUrl = `${frontendUrl}/billing`;

      const portalSession = await BillingService.createPortalSession(userId, returnUrl);

      res.json({
        success: true,
        data: {
          portal_url: portalSession.url
        }
      });
    } catch (error) {
      console.error('Error creating portal session:', error);
      if (error.message === 'Billing not available') {
        return res.status(400).json({
          error: 'billing_unavailable',
          message: 'Billing is not enabled on this instance'
        });
      }
      next(error);
    }
  },

  // Handle Stripe webhooks
  async handleWebhook(req, res, next) {
    console.log('Webhook received:', {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      bodyType: typeof req.body,
      bodyIsBuffer: Buffer.isBuffer(req.body),
      signature: req.headers['stripe-signature'] ? 'present' : 'missing'
    });
    
    try {
      const signature = req.headers['stripe-signature'];
      
      if (!signature) {
        console.error('Webhook missing signature');
        return res.status(400).json({
          error: 'missing_signature',
          message: 'Stripe signature header is required'
        });
      }

      // req.body should be raw buffer for webhook signature verification
      const payload = req.body;
      
      const result = await BillingService.handleWebhook(payload, signature);
      
      console.log('Webhook processed successfully');
      res.json(result);
    } catch (error) {
      console.error('Webhook error:', error);
      
      if (error.message.includes('signature verification failed')) {
        return res.status(400).json({
          error: 'invalid_signature',
          message: 'Webhook signature verification failed'
        });
      }
      
      if (error.message === 'Billing not available for webhook processing') {
        return res.status(400).json({
          error: 'billing_unavailable',
          message: 'Billing is not enabled on this instance'
        });
      }
      
      res.status(500).json({
        error: 'webhook_error',
        message: 'Error processing webhook'
      });
    }
  },

  // Check checkout session status
  async getCheckoutSession(req, res, next) {
    try {
      const { sessionId } = req.params;
      const userId = req.user.id;
      
      const billingAvailable = await BillingService.isBillingAvailable();
      if (!billingAvailable) {
        return res.status(400).json({
          error: 'billing_unavailable',
          message: 'Billing is not enabled on this instance'
        });
      }

      const stripe = BillingService.getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      // Verify session belongs to current user
      if (session.metadata.user_id !== userId) {
        return res.status(403).json({
          error: 'access_denied',
          message: 'Session does not belong to current user'
        });
      }

      // If session is complete and has a subscription, ensure it's synced
      if (session.status === 'complete' && session.subscription) {
        console.log('Checkout session complete, syncing subscription:', session.subscription);
        
        try {
          // Fetch the subscription from Stripe
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          
          // Update our database with the subscription
          await BillingService.handleSubscriptionUpdated(subscription);
          
          console.log('Subscription synced successfully');
        } catch (syncError) {
          console.error('Error syncing subscription:', syncError);
          // Continue anyway - webhook might process it later
        }
      }

      res.json({
        success: true,
        data: {
          id: session.id,
          status: session.status,
          payment_status: session.payment_status,
          customer: session.customer,
          subscription: session.subscription
        }
      });
    } catch (error) {
      console.error('Error fetching checkout session:', error);
      next(error);
    }
  },

  // Get billing configuration (for admin)
  async getBillingConfig(req, res, next) {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin' && req.user.role !== 'owner') {
        return res.status(403).json({
          error: 'access_denied',
          message: 'Admin access required'
        });
      }

      const billingEnabled = await TierService.isBillingEnabled(req.headers.host);
      const billingAvailable = await BillingService.isBillingAvailable();

      res.json({
        success: true,
        data: {
          billing_enabled: billingEnabled,
          billing_available: billingAvailable,
          stripe_initialized: billingAvailable
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Debug endpoint to reset trial status (development only)
  async debugResetTrial(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Only allow in development/testing environments
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          error: 'not_allowed',
          message: 'This endpoint is only available in development'
        });
      }

      console.log('DEBUG: Resetting trial status for user:', userId);
      
      // Delete any existing trial tier overrides
      // The database trigger will automatically reset the trial_used flag
      const deleteQuery = `
        DELETE FROM tier_overrides 
        WHERE user_id = $1 AND reason ILIKE '%trial%'
      `;
      const result = await db.query(deleteQuery, [userId]);
      
      console.log('DEBUG: Deleted', result.rowCount, 'trial records for user:', userId);
      console.log('DEBUG: trial_used flag automatically reset by database trigger');

      res.json({
        success: true,
        message: `Reset trial status for user. Deleted ${result.rowCount} trial records.`,
        user_id: userId
      });
    } catch (error) {
      console.error('Error resetting trial status:', error);
      next(error);
    }
  }
};

module.exports = billingController;