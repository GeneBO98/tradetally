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
    this.unsupportedCreateFields = new Set();
    this.unsupportedUpdateFields = new Set();
  }

  normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
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

      const responseText = await response.text();
      let result;

      try {
        result = JSON.parse(responseText);
      } catch (error) {
        const isRetryableResponse = response.status >= 500 || responseText.startsWith('<!DOCTYPE');

        if (isRetryableResponse && attempt < retries) {
          const delay = Math.pow(2, attempt + 1) * 1000;
          console.log(
            `[TWENTY SYNC] Received non-JSON response (${response.status}), retrying in ${delay / 1000}s...`
          );
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        const snippet = responseText.slice(0, 120).replace(/\s+/g, ' ').trim();
        throw new Error(`Twenty API returned non-JSON response (${response.status}): ${snippet}`);
      }

      if (!response.ok) {
        const errorMessage = result?.errors?.[0]?.message || `HTTP ${response.status}`;
        const isRetryableStatus = response.status >= 500;

        if (isRetryableStatus && attempt < retries) {
          const delay = Math.pow(2, attempt + 1) * 1000;
          console.log(`[TWENTY SYNC] HTTP ${response.status}, retrying in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        throw new Error(`Twenty GraphQL error: ${errorMessage}`);
      }

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
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      return null;
    }

    const queries = [
      {
        label: 'nested_email_filter',
        query: `
          query FindPerson($email: String!) {
            people(filter: { emails: { primaryEmail: { eq: $email } } }, first: 10) {
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
        `
      },
      {
        label: 'flattened_primary_email_filter',
        query: `
          query FindPersonByPrimaryEmail($email: String!) {
            people(filter: { emailsPrimaryEmail: { eq: $email } }, first: 10) {
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
        `
      }
    ];

    for (const candidate of queries) {
      try {
        const data = await this.graphql(candidate.query, { email: normalizedEmail });
        const matches = data?.people?.edges
          ?.map(edge => edge?.node)
          .filter(Boolean)
          .filter((person) => this.normalizeEmail(person?.emails?.primaryEmail) === normalizedEmail) || [];

        if (matches.length > 0) {
          return matches[0];
        }
      } catch (error) {
        console.warn(
          `[TWENTY SYNC] Email lookup attempt "${candidate.label}" failed for ${normalizedEmail}: ${error.message}`
        );
      }
    }

    return null;
  }

  async getMappedPersonId(userId) {
    if (!userId) return null;

    const result = await db.query(
      `SELECT twenty_person_id FROM twenty_person_sync_map WHERE user_id = $1`,
      [userId]
    );

    return result.rows[0]?.twenty_person_id || null;
  }

  async savePersonMapping(userId, personId, email) {
    if (!userId || !personId) return;

    await db.query(
      `
        INSERT INTO twenty_person_sync_map (user_id, twenty_person_id, email)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id)
        DO UPDATE SET
          twenty_person_id = EXCLUDED.twenty_person_id,
          email = EXCLUDED.email,
          updated_at = CURRENT_TIMESTAMP
      `,
      [userId, personId, this.normalizeEmail(email) || null]
    );
  }

  async clearPersonMapping(userId) {
    if (!userId) return;

    await db.query(`DELETE FROM twenty_person_sync_map WHERE user_id = $1`, [userId]);
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
        primaryEmail: this.normalizeEmail(userData.email),
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
      // Engagement data (from user_engagement_summary)
      engagementScore: parseInt(userData.engagement_score) || 0,
      engagementTier: userData.engagement_tier || 'new',
      daysActiveLast30: parseInt(userData.days_active_last_30) || 0,
      mostUsedFeature: userData.most_used_feature || '',
      diaryEntryCount: parseInt(userData.total_diary_entries) || 0,
      brokerSyncCount: parseInt(userData.total_broker_syncs) || 0,
      // Acquisition data (from user_acquisition)
      utmSource: userData.utm_source || '',
      utmMedium: userData.utm_medium || '',
      utmCampaign: userData.utm_campaign || '',
    };
  }

  filterUnsupportedFields(personData, unsupportedFields) {
    return Object.fromEntries(
      Object.entries(personData).filter(([field]) => !unsupportedFields.has(field))
    );
  }

  extractUnsupportedInputField(errorMessage, inputType) {
    const escapedInputType = inputType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = errorMessage.match(
      new RegExp(`Field "([^"]+)" is not defined by type "${escapedInputType}"`)
    );

    return match?.[1] || null;
  }

  async executePersonMutation({ query, variables, resultKey, inputType, unsupportedFields }) {
    const filteredVariables = {
      ...variables,
      data: this.filterUnsupportedFields(variables.data, unsupportedFields),
    };

    try {
      const data = await this.graphql(query, filteredVariables);
      return data?.[resultKey];
    } catch (error) {
      const unsupportedField = this.extractUnsupportedInputField(error.message, inputType);

      if (!unsupportedField || unsupportedFields.has(unsupportedField)) {
        throw error;
      }

      unsupportedFields.add(unsupportedField);
      console.warn(
        `[TWENTY SYNC] Ignoring unsupported ${inputType} field "${unsupportedField}" for future syncs`
      );

      const retriedVariables = {
        ...variables,
        data: this.filterUnsupportedFields(variables.data, unsupportedFields),
      };

      const data = await this.graphql(query, retriedVariables);
      return data?.[resultKey];
    }
  }

  /**
   * Execute a mutation, auto-stripping fields Twenty doesn't recognize
   */
  async graphqlWithFieldStripping(query, variables, dataKey) {
    let data = { ...variables.data };
    const maxStrips = 10;

    for (let i = 0; i < maxStrips; i++) {
      try {
        const result = await this.graphql(query, { ...variables, data });
        return result?.[dataKey];
      } catch (error) {
        const match = error.message.match(/Field "(\w+)" is not defined by type/);
        if (match) {
          const field = match[1];
          console.log(`[TWENTY SYNC] Stripping unrecognized field "${field}" and retrying`);
          delete data[field];
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Create a person in Twenty
   */
  async createPerson(userData) {
    return this.executePersonMutation({
      query: `
      mutation CreatePerson($data: PersonCreateInput!) {
        createPerson(data: $data) {
          id
          name { firstName lastName }
          emails { primaryEmail }
        }
      }
    `,
      variables: {
        data: this.buildPersonData(userData),
      },
      resultKey: 'createPerson',
      inputType: 'PersonCreateInput',
      unsupportedFields: this.unsupportedCreateFields,
    });
  }

  /**
   * Update an existing person in Twenty
   */
  async updatePerson(personId, userData) {
    const personData = this.buildPersonData(userData);
    // Don't overwrite emails on update
    delete personData.emails;

    return this.executePersonMutation({
      query: `
      mutation UpdatePerson($id: ID!, $data: PersonUpdateInput!) {
        updatePerson(id: $id, data: $data) {
          id
          name { firstName lastName }
          emails { primaryEmail }
        }
      }
    `,
      variables: {
        id: personId,
        data: personData,
      },
      resultKey: 'updatePerson',
      inputType: 'PersonUpdateInput',
      unsupportedFields: this.unsupportedUpdateFields,
    });
  }

  /**
   * Create or update a person in Twenty
   */
  async upsertPerson(userData) {
    const mappedPersonId = await this.getMappedPersonId(userData.id);

    if (mappedPersonId) {
      try {
        return await this.updatePerson(mappedPersonId, userData);
      } catch (error) {
        console.warn(
          `[TWENTY SYNC] Stored mapping for ${userData.email} failed (${mappedPersonId}): ${error.message}`
        );

        if (!/not found|record not found|cannot query field/i.test(error.message)) {
          throw error;
        }

        await this.clearPersonMapping(userData.id);
      }
    }

    const existing = await this.findPersonByEmail(userData.email);

    if (existing) {
      await this.savePersonMapping(userData.id, existing.id, userData.email);
      return this.updatePerson(existing.id, userData);
    }

    const created = await this.createPerson(userData);
    await this.savePersonMapping(userData.id, created?.id, userData.email);
    return created;
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
        (SELECT MAX(created_at) FROM trades WHERE user_id = u.id) AS last_trade_at,
        ues.engagement_score,
        ues.engagement_tier,
        ues.days_active_last_30,
        ues.most_used_feature,
        ues.total_diary_entries,
        ues.total_broker_syncs,
        ues.lifecycle_stage AS engagement_lifecycle,
        ua.utm_source,
        ua.utm_medium,
        ua.utm_campaign
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
        AND s.status IN ('active', 'trialing', 'canceled')
      LEFT JOIN user_engagement_summary ues ON ues.user_id = u.id
      LEFT JOIN user_acquisition ua ON ua.user_id = u.id
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
