const BillingService = require('../services/billingService');
const TierService = require('../services/tierService');
const User = require('../models/User');

const billingController = {
  
  // Get billing status
  async getBillingStatus(req, res, next) {
    try {
      const billingEnabled = await TierService.isBillingEnabled(req.headers.host);
      const billingAvailable = await BillingService.isBillingAvailable();
      
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
      const subscription = await BillingService.getSubscriptionDetails(userId);
      const userTier = await TierService.getUserTier(userId);
      const tierOverride = await User.getTierOverride(userId);
      
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
          trial,
          has_used_trial: !!tierOverride // User has used trial if any tier override exists
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
      const plans = await BillingService.getPricingPlans();
      
      res.json({
        success: true,
        data: plans
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
        data: {
          checkout_url: session.url,
          session_id: session.id
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
    try {
      const userId = req.user.id;
      
      // Check if user already had a trial
      const existingOverride = await User.getTierOverride(userId);
      if (existingOverride) {
        return res.status(400).json({
          error: 'trial_already_used',
          message: 'You have already used your free trial'
        });
      }

      // Check if user already has a subscription
      const subscription = await User.getSubscription(userId);
      if (subscription && subscription.status === 'active') {
        return res.status(400).json({
          error: 'already_subscribed',
          message: 'You already have an active subscription'
        });
      }

      // Create 14-day trial tier override
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);

      await User.createTierOverride(userId, 'pro', 'Free 14-day trial', expiresAt);

      res.json({
        success: true,
        message: 'Free trial started successfully',
        trial_expires_at: expiresAt
      });
    } catch (error) {
      console.error('Error starting trial:', error);
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
  }
};

module.exports = billingController;