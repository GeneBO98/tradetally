const db = require('../config/database');
const TierService = require('./tierService');
const User = require('../models/User');

// Conditionally load Stripe only if billing is enabled
let stripe = null;

class BillingService {
  // Initialize Stripe with conditional loading
  static async initialize() {
    const billingEnabled = await TierService.isBillingEnabled();
    if (!billingEnabled) {
      console.log('Billing is disabled - Stripe not initialized');
      return false;
    }

    try {
      // Get Stripe secret key from admin settings
      const secretKeyQuery = `SELECT setting_value FROM admin_settings WHERE setting_key = 'stripe_secret_key'`;
      const result = await db.query(secretKeyQuery);
      
      if (!result.rows[0] || !result.rows[0].setting_value) {
        console.warn('Stripe secret key not configured - billing unavailable');
        return false;
      }

      const secretKey = result.rows[0].setting_value;
      
      // Dynamically import Stripe
      const Stripe = (await import('stripe')).default;
      stripe = new Stripe(secretKey, {
        apiVersion: '2023-10-16',
      });
      
      console.log('Stripe initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Stripe:', error);
      return false;
    }
  }

  // Check if billing is available
  static async isBillingAvailable() {
    const billingEnabled = await TierService.isBillingEnabled();
    return billingEnabled && stripe !== null;
  }

  // Get Stripe instance (throws if not available)
  static getStripe() {
    if (!stripe) {
      throw new Error('Stripe not initialized - billing is disabled');
    }
    return stripe;
  }

  // Create or get Stripe customer
  static async createOrGetCustomer(userId) {
    const billingAvailable = await this.isBillingAvailable();
    if (!billingAvailable) {
      throw new Error('Billing not available');
    }

    // Check if customer already exists
    const existingSubscription = await User.getSubscription(userId);
    if (existingSubscription && existingSubscription.stripe_customer_id) {
      return existingSubscription.stripe_customer_id;
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        user_id: userId,
        username: user.username || ''
      }
    });

    // Store customer ID in database
    await this.createOrUpdateSubscription(userId, {
      stripe_customer_id: customer.id
    });

    return customer.id;
  }

  // Create checkout session
  static async createCheckoutSession(userId, priceId, successUrl, cancelUrl) {
    const billingAvailable = await this.isBillingAvailable();
    if (!billingAvailable) {
      throw new Error('Billing not available');
    }

    const customerId = await this.createOrGetCustomer(userId);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: userId
      }
    });

    return session;
  }

  // Create customer portal session
  static async createPortalSession(userId, returnUrl) {
    const billingAvailable = await this.isBillingAvailable();
    if (!billingAvailable) {
      throw new Error('Billing not available');
    }

    const customerId = await this.createOrGetCustomer(userId);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return portalSession;
  }

  // Get subscription details
  static async getSubscriptionDetails(userId) {
    const subscription = await User.getSubscription(userId);
    
    if (!subscription || !subscription.stripe_subscription_id) {
      return null;
    }

    const billingAvailable = await this.isBillingAvailable();
    if (!billingAvailable) {
      // Return basic info from database if Stripe not available
      return {
        id: subscription.stripe_subscription_id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        stripe_unavailable: true
      };
    }

    try {
      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripe_subscription_id
      );

      return {
        id: stripeSubscription.id,
        status: stripeSubscription.status,
        current_period_start: new Date(stripeSubscription.current_period_start * 1000),
        current_period_end: new Date(stripeSubscription.current_period_end * 1000),
        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        items: stripeSubscription.items.data.map(item => ({
          price_id: item.price.id,
          product_name: item.price.nickname || 'Pro Plan',
          amount: item.price.unit_amount,
          currency: item.price.currency,
          interval: item.price.recurring?.interval
        }))
      };
    } catch (error) {
      console.error('Error fetching Stripe subscription:', error);
      // Return database info as fallback
      return {
        id: subscription.stripe_subscription_id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        error: 'Unable to fetch latest details from Stripe'
      };
    }
  }

  // Handle webhook events
  static async handleWebhook(payload, signature) {
    const billingAvailable = await this.isBillingAvailable();
    if (!billingAvailable) {
      throw new Error('Billing not available for webhook processing');
    }

    // Get webhook endpoint secret
    const secretQuery = `SELECT value FROM instance_config WHERE key = 'stripe_webhook_endpoint_secret'`;
    const result = await db.query(secretQuery);
    const endpointSecret = result.rows[0]?.value;

    if (!endpointSecret) {
      throw new Error('Webhook endpoint secret not configured');
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, endpointSecret);
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  }

  // Handle subscription created/updated
  static async handleSubscriptionUpdated(subscription) {
    const customerId = subscription.customer;
    
    // Find user by customer ID
    const userQuery = `
      SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1
    `;
    const userResult = await db.query(userQuery, [customerId]);
    
    if (!userResult.rows[0]) {
      console.error('User not found for customer:', customerId);
      return;
    }

    const userId = userResult.rows[0].user_id;

    // Update subscription in database
    await this.createOrUpdateSubscription(userId, {
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscription.items.data[0]?.price.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
    });

    // Update user tier
    await TierService.handleSubscriptionUpdate(subscription.id, subscription.status);
  }

  // Handle subscription deleted
  static async handleSubscriptionDeleted(subscription) {
    await TierService.handleSubscriptionUpdate(subscription.id, 'canceled');
    
    // Update subscription status in database
    const updateQuery = `
      UPDATE subscriptions 
      SET status = 'canceled', 
          canceled_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE stripe_subscription_id = $1
    `;
    await db.query(updateQuery, [subscription.id]);
  }

  // Handle successful payment
  static async handlePaymentSucceeded(invoice) {
    console.log('Payment succeeded for invoice:', invoice.id);
    // Could add logic for tracking successful payments, sending receipts, etc.
  }

  // Handle failed payment
  static async handlePaymentFailed(invoice) {
    console.log('Payment failed for invoice:', invoice.id);
    // Could add logic for handling failed payments, notifications, etc.
  }

  // Create or update subscription record
  static async createOrUpdateSubscription(userId, subscriptionData) {
    const query = `
      INSERT INTO subscriptions (
        user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
        status, current_period_start, current_period_end, cancel_at_period_end, canceled_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id)
      DO UPDATE SET
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
        stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id),
        stripe_price_id = COALESCE(EXCLUDED.stripe_price_id, subscriptions.stripe_price_id),
        status = COALESCE(EXCLUDED.status, subscriptions.status),
        current_period_start = COALESCE(EXCLUDED.current_period_start, subscriptions.current_period_start),
        current_period_end = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
        cancel_at_period_end = COALESCE(EXCLUDED.cancel_at_period_end, subscriptions.cancel_at_period_end),
        canceled_at = COALESCE(EXCLUDED.canceled_at, subscriptions.canceled_at),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [
      userId,
      subscriptionData.stripe_customer_id || null,
      subscriptionData.stripe_subscription_id || null,
      subscriptionData.stripe_price_id || null,
      subscriptionData.status || null,
      subscriptionData.current_period_start || null,
      subscriptionData.current_period_end || null,
      subscriptionData.cancel_at_period_end || null,
      subscriptionData.canceled_at || null
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Get available pricing plans
  static async getPricingPlans() {
    const billingAvailable = await this.isBillingAvailable();
    if (!billingAvailable) {
      return [];
    }

    try {
      // Get price IDs from admin settings
      const priceQuery = `
        SELECT setting_key, setting_value 
        FROM admin_settings 
        WHERE setting_key IN ('stripe_price_id_monthly', 'stripe_price_id_yearly')
      `;
      const priceResult = await db.query(priceQuery);
      
      const priceIds = {};
      priceResult.rows.forEach(row => {
        if (row.setting_value) {
          priceIds[row.setting_key] = row.setting_value;
        }
      });

      const plans = [];
      
      // Fetch pricing details from Stripe
      for (const [key, priceId] of Object.entries(priceIds)) {
        try {
          const price = await stripe.prices.retrieve(priceId);
          const product = await stripe.products.retrieve(price.product);
          
          plans.push({
            id: price.id,
            type: key.includes('monthly') ? 'monthly' : 'yearly',
            amount: price.unit_amount,
            currency: price.currency,
            interval: price.recurring?.interval,
            interval_count: price.recurring?.interval_count,
            product_name: product.name,
            product_description: product.description
          });
        } catch (error) {
          console.error(`Error fetching price ${priceId}:`, error);
        }
      }

      return plans;
    } catch (error) {
      console.error('Error fetching pricing plans:', error);
      return [];
    }
  }
}

module.exports = BillingService;