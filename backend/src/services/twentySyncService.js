const db = require('../config/database');

/**
 * Twenty CRM Sync Service
 * Syncs TradeTally users, subscription status, and product health signals
 * into Twenty CRM via its GraphQL API.
 *
 * Twenty endpoints:
 *   /graphql   - data queries/mutations (people, companies, etc.)
 *   /metadata  - workspace schema introspection
 */
class TwentySyncService {
  constructor() {
    this.apiUrl = process.env.TWENTY_API_URL;
    this.apiKey = process.env.TWENTY_API_KEY;
    this.enabled = false;
  }

  initialize() {
    if (!this.apiUrl || !this.apiKey) {
      console.log('[TWENTY SYNC] Disabled - TWENTY_API_URL or TWENTY_API_KEY not configured');
      return false;
    }

    this.apiUrl = this.apiUrl.replace(/\/+$/, '');
    this.enabled = true;
    console.log('[TWENTY SYNC] Initialized with API URL:', this.apiUrl);
    return true;
  }

  /**
   * Execute a GraphQL query/mutation against Twenty with retry on rate limit
   */
  async graphql(query, variables = {}, retries = 3) {
    if (!this.enabled) {
      throw new Error('Twenty sync not initialized');
    }

    const fetch = (await import('node-fetch')).default;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(`${this.apiUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });

      const result = await response.json();

      if (result.errors?.length) {
        const msg = result.errors[0].message;
        if (msg.includes('Too many requests') && attempt < retries) {
          const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
          console.log(`[TWENTY SYNC] Rate limited, waiting ${delay / 1000}s before retry...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(`Twenty GraphQL error: ${msg}`);
      }

      return result.data;
    }
  }

  /**
   * Find a person in Twenty by email
   */
  async findPersonByEmail(email) {
    try {
      const data = await this.graphql(`
        query FindPerson($email: String!) {
          people(filter: { emails: { primaryEmail: { eq: $email } } }, first: 1) {
            edges {
              node {
                id
                name { firstName lastName }
                emails { primaryEmail }
                city
                jobTitle
              }
            }
          }
        }
      `, { email });

      return data?.people?.edges?.[0]?.node || null;
    } catch (error) {
      console.error('[TWENTY SYNC] Error finding person by email:', email, error.message);
      return null;
    }
  }

  /**
   * Build the custom field data payload for a user
   */
  buildPersonData(userData) {
    const health = this.deriveHealthStatus(userData);
    const lifecycle = this.deriveLifecycleStage(userData);

    return {
      name: {
        firstName: userData.full_name?.split(' ')[0] || userData.username || '',
        lastName: userData.full_name?.split(' ').slice(1).join(' ') || '',
      },
      emails: {
        primaryEmail: userData.email,
      },
      city: userData.timezone || '',
      tier: userData.tier || 'free',
      lifecycleStage: lifecycle,
      healthStatus: health,
      tradeCount: parseInt(userData.trade_count) || 0,
      importCount: parseInt(userData.import_count) || 0,
      signupDate: userData.created_at ? new Date(userData.created_at).toISOString().split('T')[0] : null,
      lastLoginAt: userData.last_login_at ? new Date(userData.last_login_at).toISOString() : null,
      stripeCustomerId: userData.stripe_customer_id || '',
      subscriptionStatus: userData.subscription_status || 'none',
    };
  }

  /**
   * Create a person in Twenty
   */
  async createPerson(userData) {
    const data = await this.graphql(`
      mutation CreatePerson($data: PersonCreateInput!) {
        createPerson(data: $data) {
          id
          name { firstName lastName }
          emails { primaryEmail }
        }
      }
    `, {
      data: this.buildPersonData(userData),
    });

    return data?.createPerson;
  }

  /**
   * Update an existing person in Twenty
   */
  async updatePerson(personId, userData) {
    const personData = this.buildPersonData(userData);
    // Don't overwrite emails on update
    delete personData.emails;

    const data = await this.graphql(`
      mutation UpdatePerson($id: ID!, $data: PersonUpdateInput!) {
        updatePerson(id: $id, data: $data) {
          id
          name { firstName lastName }
          emails { primaryEmail }
        }
      }
    `, {
      id: personId,
      data: personData,
    });

    return data?.updatePerson;
  }

  /**
   * Create or update a person in Twenty
   */
  async upsertPerson(userData) {
    const existing = await this.findPersonByEmail(userData.email);

    if (existing) {
      return this.updatePerson(existing.id, userData);
    } else {
      return this.createPerson(userData);
    }
  }

  /**
   * Fetch all users with subscription and activity data from TradeTally
   */
  async fetchUsersWithContext() {
    const query = `
      SELECT
        u.id,
        u.email,
        u.username,
        u.full_name,
        u.role,
        u.tier,
        u.is_verified,
        u.timezone,
        u.created_at,
        u.last_login_at,
        u.marketing_consent,
        s.stripe_customer_id,
        s.stripe_subscription_id,
        s.status AS subscription_status,
        s.current_period_start,
        s.current_period_end,
        s.cancel_at_period_end,
        s.canceled_at,
        (SELECT COUNT(*) FROM trades WHERE user_id = u.id) AS trade_count,
        (SELECT COUNT(*) FROM import_logs WHERE user_id = u.id) AS import_count,
        (SELECT MAX(created_at) FROM trades WHERE user_id = u.id) AS last_trade_at
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
   * Derive product health status from user activity
   */
  deriveHealthStatus(user) {
    const now = new Date();
    const lastLogin = user.last_login_at ? new Date(user.last_login_at) : null;
    const lastTrade = user.last_trade_at ? new Date(user.last_trade_at) : null;
    const lastActivity = lastLogin && lastTrade
      ? (lastLogin > lastTrade ? lastLogin : lastTrade)
      : lastLogin || lastTrade;

    if (!lastActivity) return 'never_active';

    const daysSinceActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));

    if (daysSinceActivity <= 3) return 'active';
    if (daysSinceActivity <= 7) return 'engaged';
    if (daysSinceActivity <= 14) return 'cooling';
    if (daysSinceActivity <= 30) return 'at_risk';
    return 'churned';
  }

  /**
   * Derive lifecycle stage
   */
  deriveLifecycleStage(user) {
    if (user.subscription_status === 'active') return 'customer';
    if (user.subscription_status === 'trialing') return 'trial';
    if (user.subscription_status === 'canceled' || user.canceled_at) return 'churned';
    if (user.trade_count > 0) return 'activated';
    if (user.import_count > 0) return 'onboarding';
    return 'signed_up';
  }

  /**
   * Full sync: push all TradeTally users into Twenty
   */
  async syncAll() {
    if (!this.enabled) {
      console.log('[TWENTY SYNC] Skipping - not enabled');
      return { synced: 0, errors: 0 };
    }

    console.log('[TWENTY SYNC] Starting full sync...');
    const users = await this.fetchUsersWithContext();
    console.log(`[TWENTY SYNC] Found ${users.length} users to sync`);

    let synced = 0;
    let errors = 0;

    for (const user of users) {
      try {
        await this.upsertPerson(user);
        synced++;

        // Pace requests: each upsert is 2 API calls (find + create/update)
        // Twenty's rate limit is strict, so wait between each user
        await new Promise(r => setTimeout(r, 600));

        if (synced % 50 === 0) {
          console.log(`[TWENTY SYNC] Progress: ${synced}/${users.length}`);
        }
      } catch (error) {
        errors++;
        console.error(`[TWENTY SYNC] Error syncing user ${user.email}:`, error.message);
        // Extra pause after errors to let rate limit recover
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    console.log(`[TWENTY SYNC] Complete: ${synced} synced, ${errors} errors`);
    return { synced, errors };
  }

  /**
   * Sync a single user (useful for webhook-triggered updates)
   */
  async syncUser(userId) {
    if (!this.enabled) return null;

    const query = `
      SELECT
        u.id, u.email, u.username, u.full_name, u.role, u.tier,
        u.is_verified, u.timezone, u.created_at, u.last_login_at,
        s.stripe_customer_id, s.status AS subscription_status,
        s.cancel_at_period_end, s.canceled_at,
        (SELECT COUNT(*) FROM trades WHERE user_id = u.id) AS trade_count,
        (SELECT COUNT(*) FROM import_logs WHERE user_id = u.id) AS import_count,
        (SELECT MAX(created_at) FROM trades WHERE user_id = u.id) AS last_trade_at
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
        AND s.status IN ('active', 'trialing', 'canceled')
      WHERE u.id = $1
    `;

    const result = await db.query(query, [userId]);
    if (result.rows.length === 0) return null;

    const user = result.rows[0];
    return this.upsertPerson(user);
  }
}

module.exports = new TwentySyncService();
