const db = require('../config/database');
const { subscribe } = require('../events/domainEvents');

class ActivityTrackingService {
  constructor() {
    this.buffer = [];
    this.flushInterval = null;
    this.BATCH_SIZE = 100;
    this.FLUSH_INTERVAL_MS = 5000;
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;

    // Periodic flush
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => {
        console.error('[ACTIVITY_TRACKING] Flush error:', err.message);
      });
    }, this.FLUSH_INTERVAL_MS);

    // Subscribe to all domain events via wildcard
    subscribe('*', (event) => {
      this._handleDomainEvent(event);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());

    console.log('[ACTIVITY_TRACKING] Service started');
  }

  async stop() {
    if (!this.started) return;
    this.started = false;
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
    console.log('[ACTIVITY_TRACKING] Service stopped');
  }

  /**
   * Track a user activity event
   * @param {string|null} userId
   * @param {string} eventType - e.g. 'trade.created', 'auth.login'
   * @param {string} eventCategory - e.g. 'trade', 'auth', 'feature'
   * @param {object} metadata - flexible event payload
   * @param {object} reqContext - { ip, userAgent, sessionId, responseTimeMs, marketingConsent }
   */
  trackEvent(userId, eventType, eventCategory, metadata = {}, reqContext = {}) {
    const event = {
      user_id: userId || null,
      event_type: eventType,
      event_category: eventCategory,
      metadata: metadata,
      ip_address: reqContext.marketingConsent !== false ? (reqContext.ip || null) : null,
      user_agent: reqContext.marketingConsent !== false ? (reqContext.userAgent || null) : null,
      session_id: reqContext.sessionId || null,
      response_time_ms: reqContext.responseTimeMs || null,
      created_at: new Date()
    };

    this.buffer.push(event);

    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush().catch(err => {
        console.error('[ACTIVITY_TRACKING] Flush error:', err.message);
      });
    }
  }

  /**
   * Track feature usage and update engagement summary
   */
  async trackFeatureUsage(userId, feature) {
    if (!userId || !feature) return;

    try {
      await db.query(`
        INSERT INTO user_engagement_summary (user_id, features_used, last_feature_used, updated_at)
        VALUES ($1, jsonb_build_object($2::text, 1), $2, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          features_used = COALESCE(user_engagement_summary.features_used, '{}'::jsonb) ||
            jsonb_build_object($2::text, (COALESCE((user_engagement_summary.features_used->>$2)::int, 0) + 1)),
          last_feature_used = $2,
          updated_at = NOW()
      `, [userId, feature]);
    } catch (err) {
      console.error('[ACTIVITY_TRACKING] Feature usage update error:', err.message);
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    const events = this.buffer.splice(0);
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const event of events) {
      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8})`);
      values.push(
        event.user_id,
        event.event_type,
        event.event_category,
        JSON.stringify(event.metadata),
        event.ip_address,
        event.user_agent,
        event.session_id,
        event.response_time_ms,
        event.created_at
      );
      paramIndex += 9;
    }

    try {
      await db.query(`
        INSERT INTO user_activity_events (user_id, event_type, event_category, metadata, ip_address, user_agent, session_id, response_time_ms, created_at)
        VALUES ${placeholders.join(', ')}
      `, values);
    } catch (err) {
      console.error(`[ACTIVITY_TRACKING] Failed to flush ${events.length} events:`, err.message);
      // Put events back on buffer for retry (up to a limit to prevent memory issues)
      if (this.buffer.length < 1000) {
        this.buffer.unshift(...events);
      }
    }
  }

  /**
   * Handle domain events published via domainEvents.js
   */
  _handleDomainEvent(event) {
    const categoryMap = {
      'trade.created': 'trade',
      'trade.updated': 'trade',
      'trade.deleted': 'trade',
      'import.completed': 'import',
      'broker_sync.completed': 'sync',
      'price_alert.triggered': 'feature',
      'enrichment.completed': 'feature'
    };

    const category = categoryMap[event.type];
    if (!category) return;

    const userId = event.payload?.userId || event.payload?.user_id || null;
    this.trackEvent(userId, event.type, category, event.payload, {});
  }
}

// Singleton
const activityTrackingService = new ActivityTrackingService();

module.exports = activityTrackingService;
