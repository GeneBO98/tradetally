const db = require('../config/database');

/**
 * Invoice Ninja Sync Service
 * Syncs TradeTally clients and products/plans into Invoice Ninja v5 via REST API.
 *
 * Invoice Ninja v5 API docs: https://api-docs.invoicing.co/
 * Authentication: X-Api-Token header
 */
class InvoiceNinjaSyncService {
  constructor() {
    this.apiUrl = process.env.INVOICE_NINJA_API_URL;
    this.apiKey = process.env.INVOICE_NINJA_API_KEY;
    this.enabled = false;
  }

  initialize() {
    if (!this.apiUrl || !this.apiKey) {
      console.log('[INVOICE NINJA] Disabled - INVOICE_NINJA_API_URL or INVOICE_NINJA_API_KEY not configured');
      return false;
    }

    this.apiUrl = this.apiUrl.replace(/\/+$/, '');
    this.enabled = true;
    console.log('[INVOICE NINJA] Initialized with API URL:', this.apiUrl);
    return true;
  }

  /**
   * Make an authenticated request to Invoice Ninja v5 API
   */
  async request(method, endpoint, body = null) {
    if (!this.enabled) {
      throw new Error('Invoice Ninja sync not initialized');
    }

    const url = `${this.apiUrl}/api/v1${endpoint}`;
    const options = {
      method,
      headers: {
        'X-Api-Token': this.apiKey,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Invoice Ninja API ${method} ${endpoint} failed (${response.status}): ${errorBody}`);
    }

    if (response.status === 204) return null;

    return response.json();
  }

  normalizeEntity(response) {
    return response?.data || response || null;
  }

  /**
   * Find a client in Invoice Ninja by email
   */
  async findClientByEmail(email) {
    try {
      const result = await this.request('GET', `/clients?email=${encodeURIComponent(email)}`);
      return result?.data?.[0] || null;
    } catch (error) {
      console.error('[INVOICE NINJA] Error finding client:', email, error.message);
      return null;
    }
  }

  /**
   * Create or update a client in Invoice Ninja
   */
  async upsertClient(userData) {
    const existing = await this.findClientByEmail(userData.email);

    const clientData = {
      name: userData.full_name || userData.username || userData.email,
      contacts: [
        {
          email: userData.email,
          first_name: userData.full_name?.split(' ')[0] || '',
          last_name: userData.full_name?.split(' ').slice(1).join(' ') || '',
        },
      ],
      private_notes: this.buildPrivateNotes(userData),
      custom_value1: userData.tier || 'free',
      custom_value2: userData.subscription_status || 'none',
      custom_value3: userData.stripe_customer_id || '',
      custom_value4: userData.trade_count?.toString() || '0',
    };

    if (existing) {
      return this.request('PUT', `/clients/${existing.id}`, clientData);
    } else {
      return this.request('POST', '/clients', clientData);
    }
  }

  getSubscriptionProductKey(stripeInvoice, userData = {}) {
    const interval = stripeInvoice?.lines?.data?.[0]?.price?.recurring?.interval;

    if (interval === 'year') {
      return 'tradetally_pro_annual';
    }

    if (interval === 'month') {
      return 'tradetally_pro_monthly';
    }

    return userData.tier === 'free' ? 'tradetally_free' : 'tradetally_pro_monthly';
  }

  getSubscriptionLineNotes(stripeInvoice, userData = {}) {
    const description = stripeInvoice?.lines?.data?.[0]?.description;
    if (description) {
      return description;
    }

    const interval = stripeInvoice?.lines?.data?.[0]?.price?.recurring?.interval;
    if (interval === 'year') {
      return 'TradeTally Pro annual subscription';
    }

    if (interval === 'month') {
      return 'TradeTally Pro monthly subscription';
    }

    return `TradeTally ${userData.tier === 'free' ? 'Free' : 'Pro'} subscription`;
  }

  centsToAmount(value) {
    const cents = Number(value || 0);
    return Number((cents / 100).toFixed(2));
  }

  getInvoiceDate(stripeInvoice) {
    const paidAt = stripeInvoice?.status_transitions?.paid_at;
    const createdAt = stripeInvoice?.created;
    const unix = paidAt || createdAt;

    if (!unix) {
      return new Date().toISOString().slice(0, 10);
    }

    return new Date(unix * 1000).toISOString().slice(0, 10);
  }

  async getRevenueSyncRecord(stripeInvoiceId) {
    const result = await db.query(
      `SELECT * FROM invoice_ninja_revenue_syncs WHERE stripe_invoice_id = $1`,
      [stripeInvoiceId]
    );

    return result.rows[0] || null;
  }

  async upsertRevenueSyncRecord(stripeInvoice, values) {
    const amount = this.centsToAmount(stripeInvoice?.amount_paid || stripeInvoice?.amount_due || 0);
    const result = await db.query(
      `
        INSERT INTO invoice_ninja_revenue_syncs (
          stripe_invoice_id,
          stripe_payment_intent_id,
          stripe_customer_id,
          stripe_subscription_id,
          user_id,
          invoice_ninja_client_id,
          invoice_ninja_invoice_id,
          amount,
          currency,
          status,
          error,
          synced_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (stripe_invoice_id)
        DO UPDATE SET
          stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, invoice_ninja_revenue_syncs.stripe_payment_intent_id),
          stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, invoice_ninja_revenue_syncs.stripe_customer_id),
          stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, invoice_ninja_revenue_syncs.stripe_subscription_id),
          user_id = COALESCE(EXCLUDED.user_id, invoice_ninja_revenue_syncs.user_id),
          invoice_ninja_client_id = COALESCE(EXCLUDED.invoice_ninja_client_id, invoice_ninja_revenue_syncs.invoice_ninja_client_id),
          invoice_ninja_invoice_id = COALESCE(EXCLUDED.invoice_ninja_invoice_id, invoice_ninja_revenue_syncs.invoice_ninja_invoice_id),
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          status = EXCLUDED.status,
          error = EXCLUDED.error,
          synced_at = COALESCE(EXCLUDED.synced_at, invoice_ninja_revenue_syncs.synced_at),
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
      [
        stripeInvoice.id,
        stripeInvoice.payment_intent || null,
        stripeInvoice.customer || null,
        stripeInvoice.subscription || null,
        values.userId || null,
        values.clientId || null,
        values.invoiceId || null,
        amount,
        String(stripeInvoice.currency || 'usd').toLowerCase(),
        values.status || 'pending',
        values.error || null,
        values.syncedAt || null,
      ]
    );

    return result.rows[0];
  }

  async fetchRevenueSyncUser(userId) {
    const query = `
      SELECT
        u.id,
        u.email,
        u.username,
        u.full_name,
        u.tier,
        u.created_at,
        s.stripe_customer_id,
        s.stripe_subscription_id,
        s.status AS subscription_status,
        (SELECT COUNT(*) FROM trades WHERE user_id = u.id) AS trade_count
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      WHERE u.id = $1
      ORDER BY s.updated_at DESC NULLS LAST
      LIMIT 1
    `;

    const result = await db.query(query, [userId]);
    return result.rows[0] || null;
  }

  buildStripeRevenueInvoice(userData, stripeInvoice, clientId) {
    const amount = this.centsToAmount(stripeInvoice.amount_paid || stripeInvoice.amount_due || 0);
    const productKey = this.getSubscriptionProductKey(stripeInvoice, userData);
    const notes = this.getSubscriptionLineNotes(stripeInvoice, userData);
    const stripeInvoiceId = stripeInvoice.id || '';
    const stripeSubscriptionId = stripeInvoice.subscription || userData.stripe_subscription_id || '';
    const paymentIntentId = stripeInvoice.payment_intent || '';

    return {
      client_id: clientId,
      date: this.getInvoiceDate(stripeInvoice),
      due_date: this.getInvoiceDate(stripeInvoice),
      private_notes: [
        `Stripe invoice: ${stripeInvoiceId}`,
        stripeSubscriptionId ? `Stripe subscription: ${stripeSubscriptionId}` : null,
        paymentIntentId ? `Stripe payment intent: ${paymentIntentId}` : null,
        `TradeTally user: ${userData.id}`,
      ].filter(Boolean).join('\n'),
      custom_value1: stripeInvoiceId,
      custom_value2: stripeSubscriptionId,
      custom_value3: paymentIntentId,
      line_items: [
        {
          quantity: 1,
          cost: amount,
          product_key: productKey,
          notes,
        },
      ],
    };
  }

  async syncStripeInvoiceRevenue(userId, stripeInvoice) {
    if (!this.enabled || !stripeInvoice?.id) {
      return null;
    }

    const existingSync = await this.getRevenueSyncRecord(stripeInvoice.id);
    if (existingSync?.status === 'synced' && existingSync.invoice_ninja_invoice_id) {
      return {
        skipped: true,
        reason: 'already_synced',
        sync: existingSync,
      };
    }

    const userData = await this.fetchRevenueSyncUser(userId);
    if (!userData) {
      throw new Error(`User ${userId} not found for Invoice Ninja revenue sync`);
    }

    const amount = this.centsToAmount(stripeInvoice.amount_paid || stripeInvoice.amount_due || 0);
    if (amount <= 0) {
      return this.upsertRevenueSyncRecord(stripeInvoice, {
        userId,
        status: 'skipped',
        error: 'Stripe invoice has no paid amount',
      });
    }

    try {
      const upsertClientResult = await this.upsertClient(userData);
      const client = this.normalizeEntity(upsertClientResult);
      const invoicePayload = this.buildStripeRevenueInvoice(userData, stripeInvoice, client.id);
      const encodedAmount = encodeURIComponent(amount.toFixed(2));
      const invoiceResult = await this.request(
        'POST',
        `/invoices?paid=true&amount_paid=${encodedAmount}`,
        invoicePayload
      );
      const invoiceEntity = this.normalizeEntity(invoiceResult);
      const syncRecord = await this.upsertRevenueSyncRecord(stripeInvoice, {
        userId,
        clientId: client.id,
        invoiceId: invoiceEntity?.id || null,
        status: 'synced',
        syncedAt: new Date(),
      });

      return {
        sync: syncRecord,
        client,
        invoice: invoiceEntity,
      };
    } catch (error) {
      await this.upsertRevenueSyncRecord(stripeInvoice, {
        userId,
        status: 'failed',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Build private notes for Invoice Ninja client record
   */
  buildPrivateNotes(user) {
    const lines = [
      `TradeTally User ID: ${user.id}`,
      `Username: ${user.username}`,
      `Tier: ${user.tier}`,
      `Signup: ${user.created_at ? new Date(user.created_at).toISOString().split('T')[0] : 'unknown'}`,
    ];

    if (user.stripe_customer_id) {
      lines.push(`Stripe Customer: ${user.stripe_customer_id}`);
    }

    return lines.join('\n');
  }

  /**
   * Ensure TradeTally products/plans exist in Invoice Ninja
   */
  async syncProducts() {
    if (!this.enabled) return;

    console.log('[INVOICE NINJA] Syncing products...');

    const products = [
      {
        product_key: 'tradetally_free',
        notes: 'TradeTally Free Tier',
        price: 0,
        custom_value1: 'free',
      },
      {
        product_key: 'tradetally_pro_monthly',
        notes: 'TradeTally Pro - Monthly Subscription',
        price: 0, // Set to actual price or let Stripe handle pricing
        custom_value1: 'pro',
      },
      {
        product_key: 'tradetally_pro_annual',
        notes: 'TradeTally Pro - Annual Subscription',
        price: 0,
        custom_value1: 'pro',
      },
    ];

    for (const product of products) {
      try {
        // Check if product exists
        const existing = await this.request('GET',
          `/products?product_key=${encodeURIComponent(product.product_key)}`
        );

        if (existing?.data?.length > 0) {
          await this.request('PUT', `/products/${existing.data[0].id}`, product);
        } else {
          await this.request('POST', '/products', product);
        }
      } catch (error) {
        console.error(`[INVOICE NINJA] Error syncing product ${product.product_key}:`, error.message);
      }
    }

    console.log('[INVOICE NINJA] Products synced');
  }

  /**
   * Fetch paying/trialing users from TradeTally
   */
  async fetchBillableUsers() {
    const query = `
      SELECT
        u.id,
        u.email,
        u.username,
        u.full_name,
        u.tier,
        u.created_at,
        s.stripe_customer_id,
        s.stripe_subscription_id,
        s.status AS subscription_status,
        s.current_period_start,
        s.current_period_end,
        (SELECT COUNT(*) FROM trades WHERE user_id = u.id) AS trade_count
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
        AND s.status IN ('active', 'trialing', 'canceled')
      WHERE u.is_active = true
        AND u.role != 'admin'
        AND u.email != 'demo@example.com'
      ORDER BY u.created_at DESC
    `;

    const result = await db.query(query);
    return result.rows;
  }

  /**
   * Full sync: push all billable TradeTally users into Invoice Ninja as clients
   */
  async syncAll() {
    if (!this.enabled) {
      console.log('[INVOICE NINJA] Skipping - not enabled');
      return { synced: 0, errors: 0 };
    }

    console.log('[INVOICE NINJA] Starting full sync...');

    // Sync products first
    await this.syncProducts();

    // Sync clients
    const users = await this.fetchBillableUsers();
    console.log(`[INVOICE NINJA] Found ${users.length} users to sync`);

    let synced = 0;
    let errors = 0;

    for (const user of users) {
      try {
        await this.upsertClient(user);
        synced++;

        if (synced % 10 === 0) {
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (error) {
        errors++;
        console.error(`[INVOICE NINJA] Error syncing client ${user.email}:`, error.message);
      }
    }

    console.log(`[INVOICE NINJA] Complete: ${synced} synced, ${errors} errors`);
    return { synced, errors };
  }

  /**
   * Sync a single user (useful for webhook-triggered updates)
   */
  async syncUser(userId) {
    if (!this.enabled) return null;

    const query = `
      SELECT
        u.id, u.email, u.username, u.full_name, u.tier, u.created_at,
        s.stripe_customer_id, s.stripe_subscription_id,
        s.status AS subscription_status,
        (SELECT COUNT(*) FROM trades WHERE user_id = u.id) AS trade_count
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
        AND s.status IN ('active', 'trialing', 'canceled')
      WHERE u.id = $1
    `;

    const result = await db.query(query, [userId]);
    if (result.rows.length === 0) return null;

    return this.upsertClient(result.rows[0]);
  }
}

module.exports = new InvoiceNinjaSyncService();
