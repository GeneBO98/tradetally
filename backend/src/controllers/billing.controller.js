const BillingService = require('../services/billingService');
const TierService = require('../services/tierService');

const billingController = {
  
  // Get billing status
  async getBillingStatus(req, res, next) {
    try {
      const billingEnabled = await TierService.isBillingEnabled();
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
      
      res.json({
        success: true,
        data: {
          subscription,
          tier: userTier
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
      const { priceId } = req.body;
      
      if (!priceId) {
        return res.status(400).json({
          error: 'missing_price_id',
          message: 'Price ID is required'
        });
      }

      // Get base URL for redirect URLs
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host;
      const baseUrl = `${protocol}://${host}`;
      
      const successUrl = `${baseUrl}/billing?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${baseUrl}/pricing`;

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

  // Create customer portal session
  async createPortalSession(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Get base URL for return URL
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host;
      const returnUrl = `${protocol}://${host}/billing`;

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
    try {
      const signature = req.headers['stripe-signature'];
      
      if (!signature) {
        return res.status(400).json({
          error: 'missing_signature',
          message: 'Stripe signature header is required'
        });
      }

      // req.body should be raw buffer for webhook signature verification
      const payload = req.body;
      
      const result = await BillingService.handleWebhook(payload, signature);
      
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

      const billingEnabled = await TierService.isBillingEnabled();
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