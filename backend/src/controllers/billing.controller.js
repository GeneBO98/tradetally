const BillingService = require('../services/billingService');
const TierService = require('../services/tierService');
const User = require('../models/User');
const db = require('../config/database');
const { verifyAppleSignedTransaction, AppleTransactionVerificationError } = require('../utils/appleIapVerification');

const VALID_CANCELLATION_REASONS = new Set([
  'too_expensive',
  'not_using_enough',
  'missing_features',
  'bugs_or_reliability',
  'switching_tools',
  'temporary_break',
  'other',
  'prefer_not_to_say'
]);

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
      const user = await User.findById(userId);
      
      console.log('Subscription details:', {
        subscription: subscription ? 'exists' : 'null',
        userTier,
        tierOverride: tierOverride ? 'exists' : 'null'
      });

      const hasPaidSubscription = subscription &&
        (subscription.status === 'active' || subscription.status === 'trialing');
      
      // Check if user has an active trial
      let trial = null;
      if (!hasPaidSubscription && tierOverride && tierOverride.reason && tierOverride.reason.includes('trial')) {
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
          has_used_trial: !!(user?.trial_used || user?.trial_started_at || tierOverride)
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
      const experiments = await BillingService.getPricingExperiments(plans);
      
      console.log('Retrieved pricing plans:', plans.length, 'plans');
      
      res.json({
        success: true,
        data: plans, // Web app expects 'data'
        plans: plans, // Mobile app expects 'plans' - provide both for compatibility
        experiments
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
      const { priceId, redirectUrl, referral, pricingExperiment } = req.body;

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
        cancelUrl,
        referral,
        pricingExperiment
      );

      res.json({
        success: true,
        data: {
          checkout_url: session.url,
          session_id: session.id
        },
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
      if (error.code === 'invalid_price_id') {
        return res.status(400).json({
          error: 'invalid_price_id',
          message: 'The selected price is not available'
        });
      }
      next(error);
    }
  },

  // Start 14-day trial
  async startTrial(req, res, next) {
    try {
      const userId = req.user.id;
      const result = await BillingService.startTrialForUser(userId);

      if (result.granted) {
        return res.json({
          success: true,
          message: 'Free trial started successfully',
          trial_expires_at: result.expiresAt
        });
      }

      const reasonToHttp = {
        user_not_found: { status: 404, message: 'User not found' },
        trial_already_used: { status: 400, message: 'You have already used your free trial' },
        already_subscribed: { status: 400, message: 'You already have an active subscription' }
      };
      const mapped = reasonToHttp[result.reason] || { status: 400, message: 'Unable to start trial' };
      return res.status(mapped.status).json({ error: result.reason, message: mapped.message });
    } catch (error) {
      console.error('[ERROR] Error starting trial for user:', req.user?.id, error);
      next(error);
    }
  },

  // Cancel subscription at period end
  async cancelSubscription(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        cancellationReason = null,
        feedbackText = null
      } = req.body || {};

      if (!cancellationReason || !VALID_CANCELLATION_REASONS.has(cancellationReason)) {
        return res.status(400).json({
          error: 'invalid_cancellation_reason',
          message: 'A valid cancellation reason is required'
        });
      }

      console.log('[BILLING] Cancel subscription request for user:', userId);

      const result = await BillingService.cancelSubscription(userId, {
        cancellationReason,
        feedbackText
      });

      console.log('[BILLING] Subscription set to cancel at period end:', result.id);
      res.json({
        success: true,
        message: 'Subscription will be canceled at the end of the current billing period',
        data: result
      });
    } catch (error) {
      console.error('[ERROR] Error canceling subscription:', error);
      if (error.message === 'Billing not available') {
        return res.status(400).json({
          error: 'billing_unavailable',
          message: 'Billing is not enabled on this instance'
        });
      }
      if (error.message === 'No active subscription found' || error.message === 'Subscription is not active') {
        return res.status(400).json({
          error: 'invalid_subscription',
          message: error.message
        });
      }
      next(error);
    }
  },

  // Reactivate a subscription set to cancel
  async reactivateSubscription(req, res, next) {
    try {
      const userId = req.user.id;
      console.log('[BILLING] Reactivate subscription request for user:', userId);

      const result = await BillingService.reactivateSubscription(userId);

      console.log('[BILLING] Subscription reactivated:', result.id);
      res.json({
        success: true,
        message: 'Subscription has been reactivated',
        data: result
      });
    } catch (error) {
      console.error('[ERROR] Error reactivating subscription:', error);
      if (error.message === 'Billing not available') {
        return res.status(400).json({
          error: 'billing_unavailable',
          message: 'Billing is not enabled on this instance'
        });
      }
      if (error.message === 'No subscription found' || error.message === 'Subscription is not set to cancel') {
        return res.status(400).json({
          error: 'invalid_subscription',
          message: error.message
        });
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
      const deleteQuery = `
        DELETE FROM tier_overrides
        WHERE user_id = $1 AND reason ILIKE '%trial%'
      `;
      const result = await db.query(deleteQuery, [userId]);

      await db.query(
        `
        UPDATE users
        SET trial_used = false,
            trial_started_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [userId]
      );

      console.log('DEBUG: Deleted', result.rowCount, 'trial records for user:', userId);
      console.log('DEBUG: trial history explicitly reset for development user:', userId);

      res.json({
        success: true,
        message: `Reset trial status for user. Deleted ${result.rowCount} trial records.`,
        user_id: userId
      });
    } catch (error) {
      console.error('Error resetting trial status:', error);
      next(error);
    }
  },

  // Apple In-App Purchase verification
  async verifyAppleReceipt(req, res, next) {
    try {
      const userId = req.user.id;
      const { transaction_id, product_id, receipt_data, environment } = req.body;

      console.log('🍎 Apple transaction verification requested:', {
        userId,
        transaction_id,
        product_id,
        environment,
        jws_length: (typeof receipt_data === 'string') ? receipt_data.length : 0
      });

      // Validate required fields
      if (!transaction_id || !product_id || !receipt_data) {
        return res.status(400).json({
          success: false,
          error: 'missing_fields',
          message: 'transaction_id, product_id, and receipt_data are required'
        });
      }

      // Check for duplicate transaction
      const existingTransaction = await db.query(
        'SELECT * FROM apple_transactions WHERE transaction_id = $1',
        [transaction_id]
      );

      if (existingTransaction.rows.length > 0) {
        console.log('🍎 Transaction already processed:', transaction_id);
        return res.json({
          success: true,
          message: 'Transaction already processed',
          subscription: {
            tier: 'pro',
            is_active: true
          }
        });
      }

      // receipt_data is the JWS signed transaction from StoreKit 2
      const payload = await verifyAppleSignedTransaction(receipt_data, {
        expectedTransactionId: transaction_id,
        expectedProductId: product_id
      });

      console.log('🍎 JWS verified. Transaction payload:', {
        transactionId: payload.transactionId,
        originalTransactionId: payload.originalTransactionId,
        productId: payload.productId,
        expiresDate: payload.expiresDate,
        environment: payload.environment,
        type: payload.type
      });

      // Extract expiration date (milliseconds since epoch)
      const expiresDate = payload.expiresDate
        ? new Date(payload.expiresDate)
        : null;

      const isTrialPeriod = payload.offerType === 2; // 2 = free trial

      // Grant Pro tier
      await TierService.setUserTier(userId, 'pro', 'Apple In-App Purchase');

      // Store transaction in database
      await db.query(`
        INSERT INTO apple_transactions
        (user_id, transaction_id, original_transaction_id, product_id,
         purchase_date, expires_date, is_trial, environment)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        userId,
        String(payload.transactionId),
        String(payload.originalTransactionId || payload.transactionId),
        payload.productId,
        payload.purchaseDate ? new Date(payload.purchaseDate) : new Date(),
        expiresDate,
        isTrialPeriod,
        payload.environment || environment
      ]);

      console.log('🍎 Apple transaction verified successfully for user:', userId);

      res.json({
        success: true,
        message: 'Subscription verified and activated',
        subscription: {
          tier: 'pro',
          expires_at: expiresDate,
          is_active: true
        }
      });
    } catch (error) {
      console.error('🍎 Error verifying Apple transaction:', error);
      const statusCode = error instanceof AppleTransactionVerificationError
        ? error.statusCode
        : 500;
      res.status(statusCode).json({
        success: false,
        error: 'verification_failed',
        message: error.message || 'Failed to verify transaction with Apple'
      });
    }
  }
};

module.exports = billingController;
