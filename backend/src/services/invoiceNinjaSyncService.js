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
