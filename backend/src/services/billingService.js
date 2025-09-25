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
      // Get Stripe secret key from environment or admin settings
      let secretKey = process.env.STRIPE_SECRET_KEY;
      
      // Fall back to database if not in environment
      if (!secretKey) {
        const secretKeyQuery = `SELECT setting_value FROM admin_settings WHERE setting_key = 'stripe_secret_key'`;
        const result = await db.query(secretKeyQuery);
        
        if (result.rows[0] && result.rows[0].setting_value) {
          secretKey = result.rows[0].setting_value;
        }
      }
      
      if (!secretKey) {
        console.warn('Stripe secret key not configured - billing unavailable');
        return false;
      }
      
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
      stripe_customer_id: customer.id,
      status: 'inactive'
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
      },
      subscription_data: {
        metadata: {
          user_id: userId
        }
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

    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return portalSession;
    } catch (error) {
      // If customer portal configuration is missing, create a default one
      if (error.message.includes('No configuration provided')) {
        console.log('Creating default customer portal configuration...');
        
        try {
          // Create a default customer portal configuration
          await stripe.billingPortal.configurations.create({
            features: {
              invoice_history: { enabled: true },
              payment_method_update: { enabled: true },
              subscription_cancel: { 
                enabled: true,
                mode: 'at_period_end'
              },
              subscription_pause: { enabled: false },
              subscription_update: {
                enabled: false  // Disable subscription updates to avoid products requirement
              }
            },
            business_profile: {
              privacy_policy_url: process.env.FRONTEND_URL + '/privacy',
              terms_of_service_url: process.env.FRONTEND_URL + '/terms'
            }
          });
          
          console.log('Default customer portal configuration created successfully');
          
          // Now try creating the portal session again
          const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl,
          });
          return portalSession;
        } catch (configError) {
          console.error('Failed to create customer portal configuration:', configError);
          throw new Error('Customer portal is not properly configured. Please contact support.');
        }
      } else {
        throw error;
      }
    }
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
    console.log('Webhook received - signature:', signature ? 'present' : 'missing');
    
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
      console.log('Webhook event verified:', event.type, 'ID:', event.id);
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    // Handle the event
    console.log('Processing webhook event:', event.type);
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;
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

  // Handle checkout session completed
  static async handleCheckoutCompleted(session) {
    console.log('Checkout completed:', session.id, 'mode:', session.mode, 'subscription:', session.subscription);
    if (session.mode === 'subscription' && session.subscription) {
      // Fetch the subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      console.log('Retrieved subscription:', subscription.id, 'status:', subscription.status);
      await this.handleSubscriptionUpdated(subscription);
    }
  }

  // Handle subscription created/updated
  static async handleSubscriptionUpdated(subscription) {
    console.log('Updating subscription:', subscription.id, 'customer:', subscription.customer, 'status:', subscription.status);
    const customerId = subscription.customer;
    
    let userId;
    
    // First try to get user ID from subscription metadata
    if (subscription.metadata && subscription.metadata.user_id) {
      userId = subscription.metadata.user_id;
      console.log('Found user ID in subscription metadata:', userId);
    } else {
      // Otherwise find user by customer ID
      const userQuery = `
        SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1
      `;
      const userResult = await db.query(userQuery, [customerId]);
      
      if (!userResult.rows[0]) {
        // Try one more approach - fetch the customer from Stripe
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer.metadata && customer.metadata.user_id) {
            userId = customer.metadata.user_id;
            console.log('Found user ID in customer metadata:', userId);
          } else {
            console.error('User not found for customer:', customerId);
            return;
          }
        } catch (error) {
          console.error('Error fetching customer:', error);
          return;
        }
      } else {
        userId = userResult.rows[0].user_id;
      }
    }

    // Update subscription in database
    console.log('Updating subscription for user:', userId);
    const subscriptionData = {
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscription.items.data[0]?.price.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
    };
    console.log('Subscription data:', subscriptionData);
    
    await this.createOrUpdateSubscription(userId, subscriptionData);
    console.log('Subscription updated in database');

    // Update user tier
    console.log('Updating user tier for subscription:', subscription.id, 'status:', subscription.status);
    await TierService.handleSubscriptionUpdate(subscription.id, subscription.status);
    console.log('User tier updated');
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
      ON CONFLICT (stripe_customer_id)
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

  // Get default pricing plans when Stripe is not available
  static getDefaultPlans() {
    return [
      {
        id: 'pro_monthly',
        name: 'Pro Monthly',
        price: 800, // $8.00 in cents (matches web app pricing)
        currency: 'USD',
        interval: 'month',
        interval_count: 1,
        features: [
          'Everything in Free',
          'Behavioral analytics',
          'Revenge trading detection',
          'Advanced risk metrics',
          'Real-time alerts',
          'Priority support',
          'Unlimited Watchlists',
          'Price Alerts',
          'Enhanced Charts',
          'API Access'
        ],
        popular: true
      },
      {
        id: 'pro_yearly',
        name: 'Pro Yearly',
        price: 8000, // $80.00 in cents (10 months price for 12 months)
        currency: 'USD',
        interval: 'year',
        interval_count: 1,
        features: [
          'Everything in Pro Monthly',
          '2 months free',
          'Priority support'
        ],
        popular: false
      }
    ];
  }

  // Get available pricing plans
  static async getPricingPlans() {
    const billingEnabled = await TierService.isBillingEnabled();
    const billingAvailable = await this.isBillingAvailable();
    
    console.log('getPricingPlans debug:', { billingEnabled, billingAvailable });
    
    // If billing is disabled, return empty array
    if (!billingEnabled) {
      console.log('Billing disabled, returning empty plans');
      return [];
    }
    
    // If billing is enabled but Stripe not available, return default plans
    if (!billingAvailable) {
      console.log('Billing enabled but Stripe unavailable, returning default plans');
      return this.getDefaultPlans();
    }

    try {
      // Get price IDs from admin settings
      const priceQuery = `
        SELECT setting_key, setting_value 
        FROM admin_settings 
        WHERE setting_key IN ('stripe_price_id_monthly', 'stripe_price_id_yearly')
      `;
      const priceResult = await db.query(priceQuery);
      
      console.log('Admin settings query result:', priceResult.rows);
      
      const priceIds = {};
      priceResult.rows.forEach(row => {
        if (row.setting_value) {
          priceIds[row.setting_key] = row.setting_value;
        }
      });

      console.log('Extracted price IDs:', priceIds);

      // Check for duplicate price IDs (common configuration error)
      const priceValues = Object.values(priceIds);
      const duplicatePrices = priceValues.filter((price, index) => priceValues.indexOf(price) !== index);
      if (duplicatePrices.length > 0) {
        console.warn('[WARNING] Duplicate price IDs detected:', duplicatePrices);
        console.warn('Monthly and yearly plans are using the same Stripe price ID');
      }

      const plans = [];
      
      // Fetch pricing details from Stripe
      for (const [key, priceId] of Object.entries(priceIds)) {
        try {
          console.log(`Fetching Stripe price for ${key}: ${priceId}`);
          const price = await stripe.prices.retrieve(priceId);
          const product = await stripe.products.retrieve(price.product);
          
          console.log(`Retrieved price ${priceId}:`, {
            amount: price.unit_amount,
            currency: price.currency,
            interval: price.recurring?.interval,
            product_name: product.name
          });
          
          // Create plan in format expected by iOS app
          const planType = key.includes('monthly') ? 'monthly' : 'yearly';
          const features = planType === 'monthly' ? [
            'Everything in Free',
            'Behavioral analytics', 
            'Revenge trading detection',
            'Advanced risk metrics',
            'Real-time alerts',
            'Priority support',
            'Unlimited Watchlists',
            'Price Alerts',
            'Enhanced Charts',
            'API Access'
          ] : [
            'Everything in Pro Monthly',
            '2 months free',
            'Priority support'
          ];

          plans.push({
            id: price.id,
            name: planType === 'monthly' ? 'Pro Monthly' : 'Pro Yearly',
            price: price.unit_amount, // Already in cents
            currency: price.currency.toUpperCase(),
            interval: price.recurring?.interval || planType.replace('ly', ''),
            features: features,
            popular: planType === 'monthly'
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