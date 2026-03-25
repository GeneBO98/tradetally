const cron = require('node-cron');
const db = require('../config/database');

/**
 * Engagement Scheduler
 * Recomputes user_engagement_summary every 2 hours for marketing segmentation and CRM sync.
 * Controlled by ENABLE_ENGAGEMENT_TRACKING env var.
 */
class EngagementScheduler {
  constructor() {
    this.job = null;
    this.running = false;
  }

  start() {
    const cronExpression = process.env.ENGAGEMENT_CRON || '0 */2 * * *';

    if (!cron.validate(cronExpression)) {
      console.error(`[ENGAGEMENT] Invalid cron expression: ${cronExpression}`);
      return false;
    }

    this.job = cron.schedule(cronExpression, () => this.recompute(), {
      scheduled: true,
      timezone: process.env.TZ || 'UTC',
    });

    // Daily cleanup at 3am
    this.cleanupJob = cron.schedule('0 3 * * *', () => this.cleanupOldEvents(), {
      scheduled: true,
      timezone: process.env.TZ || 'UTC',
    });

    console.log(`[ENGAGEMENT] Scheduler started (cron: ${cronExpression})`);

    // Run initial computation 60 seconds after startup
    setTimeout(() => this.recompute(), 60000);

    return true;
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
    }
    if (this.cleanupJob) {
      this.cleanupJob.stop();
      this.cleanupJob = null;
    }
  }

  async recompute() {
    if (this.running) {
      console.log('[ENGAGEMENT] Recomputation already in progress, skipping');
      return;
    }

    this.running = true;
    const startTime = Date.now();

    try {
      console.log('[ENGAGEMENT] Starting engagement summary recomputation...');

      // Recompute engagement summary for all active users
      const result = await db.query(`
        WITH user_stats AS (
          SELECT
            u.id AS user_id,
            -- Trade dates and counts
            (SELECT MIN(t.created_at) FROM trades t WHERE t.user_id = u.id) AS first_trade_at,
            (SELECT MAX(t.created_at) FROM trades t WHERE t.user_id = u.id) AS last_trade_at,
            (SELECT COUNT(*) FROM trades t WHERE t.user_id = u.id)::int AS total_trades,
            -- Import dates and counts
            (SELECT MIN(il.created_at) FROM import_logs il WHERE il.user_id = u.id) AS first_import_at,
            (SELECT MAX(il.created_at) FROM import_logs il WHERE il.user_id = u.id) AS last_import_at,
            (SELECT COUNT(*) FROM import_logs il WHERE il.user_id = u.id)::int AS total_imports,
            -- Diary dates and counts
            (SELECT MIN(de.created_at) FROM diary_entries de WHERE de.user_id = u.id) AS first_diary_at,
            (SELECT MAX(de.created_at) FROM diary_entries de WHERE de.user_id = u.id) AS last_diary_at,
            (SELECT COUNT(*) FROM diary_entries de WHERE de.user_id = u.id)::int AS total_diary_entries,
            -- Broker sync dates and counts
            (SELECT MIN(bs.created_at) FROM broker_sync_logs bs WHERE bs.user_id = u.id) AS first_broker_sync_at,
            (SELECT MAX(bs.created_at) FROM broker_sync_logs bs WHERE bs.user_id = u.id) AS last_broker_sync_at,
            (SELECT COUNT(*) FROM broker_sync_logs bs WHERE bs.user_id = u.id)::int AS total_broker_syncs,
            -- Days active from activity events
            (SELECT COUNT(DISTINCT DATE(ae.created_at))
             FROM user_activity_events ae
             WHERE ae.user_id = u.id AND ae.created_at > NOW() - INTERVAL '7 days')::int AS days_active_7,
            (SELECT COUNT(DISTINCT DATE(ae.created_at))
             FROM user_activity_events ae
             WHERE ae.user_id = u.id AND ae.created_at > NOW() - INTERVAL '30 days')::int AS days_active_30,
            (SELECT COUNT(DISTINCT DATE(ae.created_at))
             FROM user_activity_events ae
             WHERE ae.user_id = u.id AND ae.created_at > NOW() - INTERVAL '90 days')::int AS days_active_90,
            -- Last activity
            u.last_login_at,
            u.created_at AS user_created_at
          FROM users u
          WHERE u.is_active = true
            AND u.email != 'demo@example.com'
        )
        INSERT INTO user_engagement_summary (
          user_id,
          first_trade_at, last_trade_at, total_trades,
          first_import_at, last_import_at, total_imports,
          first_diary_at, last_diary_at, total_diary_entries,
          first_broker_sync_at, last_broker_sync_at, total_broker_syncs,
          days_active_last_7, days_active_last_30, days_active_last_90,
          engagement_score, engagement_tier, lifecycle_stage,
          updated_at
        )
        SELECT
          us.user_id,
          us.first_trade_at, us.last_trade_at, us.total_trades,
          us.first_import_at, us.last_import_at, us.total_imports,
          us.first_diary_at, us.last_diary_at, us.total_diary_entries,
          us.first_broker_sync_at, us.last_broker_sync_at, us.total_broker_syncs,
          us.days_active_7, us.days_active_30, us.days_active_90,
          -- Engagement score calculation (0-100)
          LEAST(100, (
            -- Days active last 30 (up to 30 points)
            LEAST(us.days_active_30, 30) +
            -- Total trades log scale (up to 20 points): 20 at 100+ trades
            LEAST(20, CASE WHEN us.total_trades > 0 THEN ROUND(20 * LN(us.total_trades + 1) / LN(101)) ELSE 0 END) +
            -- Feature diversity (up to 20 points, computed from existing features_used)
            LEAST(20, COALESCE((
              SELECT COUNT(*)::int * 2
              FROM jsonb_object_keys(COALESCE(
                (SELECT ues.features_used FROM user_engagement_summary ues WHERE ues.user_id = us.user_id),
                '{}'::jsonb
              ))
            ), 0)) +
            -- Recency (up to 15 points): 15 if active today, decaying
            CASE
              WHEN us.last_login_at IS NULL THEN 0
              WHEN us.last_login_at > NOW() - INTERVAL '1 day' THEN 15
              WHEN us.last_login_at > NOW() - INTERVAL '3 days' THEN 12
              WHEN us.last_login_at > NOW() - INTERVAL '7 days' THEN 9
              WHEN us.last_login_at > NOW() - INTERVAL '14 days' THEN 6
              WHEN us.last_login_at > NOW() - INTERVAL '30 days' THEN 3
              ELSE 0
            END +
            -- Import/sync activity (up to 15 points)
            LEAST(15, us.total_imports * 3 + us.total_broker_syncs * 2)
          ))::int,
          -- Engagement tier
          CASE
            WHEN us.last_login_at IS NOT NULL
              AND us.last_login_at < NOW() - INTERVAL '30 days' THEN 'churned'
            WHEN us.last_login_at IS NOT NULL
              AND us.last_login_at < NOW() - INTERVAL '14 days'
              AND us.days_active_30 < 3 THEN 'dormant'
            WHEN LEAST(100, (
              LEAST(us.days_active_30, 30) +
              LEAST(20, CASE WHEN us.total_trades > 0 THEN ROUND(20 * LN(us.total_trades + 1) / LN(101)) ELSE 0 END) +
              CASE
                WHEN us.last_login_at > NOW() - INTERVAL '1 day' THEN 15
                WHEN us.last_login_at > NOW() - INTERVAL '3 days' THEN 12
                WHEN us.last_login_at > NOW() - INTERVAL '7 days' THEN 9
                WHEN us.last_login_at > NOW() - INTERVAL '14 days' THEN 6
                WHEN us.last_login_at > NOW() - INTERVAL '30 days' THEN 3
                ELSE 0
              END +
              LEAST(15, us.total_imports * 3 + us.total_broker_syncs * 2)
            )) > 75 THEN 'power_user'
            WHEN LEAST(100, (
              LEAST(us.days_active_30, 30) +
              LEAST(20, CASE WHEN us.total_trades > 0 THEN ROUND(20 * LN(us.total_trades + 1) / LN(101)) ELSE 0 END) +
              CASE
                WHEN us.last_login_at > NOW() - INTERVAL '1 day' THEN 15
                WHEN us.last_login_at > NOW() - INTERVAL '3 days' THEN 12
                WHEN us.last_login_at > NOW() - INTERVAL '7 days' THEN 9
                WHEN us.last_login_at > NOW() - INTERVAL '14 days' THEN 6
                WHEN us.last_login_at > NOW() - INTERVAL '30 days' THEN 3
                ELSE 0
              END +
              LEAST(15, us.total_imports * 3 + us.total_broker_syncs * 2)
            )) > 50 THEN 'engaged'
            WHEN LEAST(100, (
              LEAST(us.days_active_30, 30) +
              LEAST(20, CASE WHEN us.total_trades > 0 THEN ROUND(20 * LN(us.total_trades + 1) / LN(101)) ELSE 0 END) +
              CASE
                WHEN us.last_login_at > NOW() - INTERVAL '1 day' THEN 15
                WHEN us.last_login_at > NOW() - INTERVAL '3 days' THEN 12
                WHEN us.last_login_at > NOW() - INTERVAL '7 days' THEN 9
                WHEN us.last_login_at > NOW() - INTERVAL '14 days' THEN 6
                WHEN us.last_login_at > NOW() - INTERVAL '30 days' THEN 3
                ELSE 0
              END +
              LEAST(15, us.total_imports * 3 + us.total_broker_syncs * 2)
            )) > 25 THEN 'active'
            WHEN LEAST(100, (
              LEAST(us.days_active_30, 30) +
              LEAST(20, CASE WHEN us.total_trades > 0 THEN ROUND(20 * LN(us.total_trades + 1) / LN(101)) ELSE 0 END) +
              CASE
                WHEN us.last_login_at > NOW() - INTERVAL '1 day' THEN 15
                WHEN us.last_login_at > NOW() - INTERVAL '3 days' THEN 12
                WHEN us.last_login_at > NOW() - INTERVAL '7 days' THEN 9
                WHEN us.last_login_at > NOW() - INTERVAL '14 days' THEN 6
                WHEN us.last_login_at > NOW() - INTERVAL '30 days' THEN 3
                ELSE 0
              END +
              LEAST(15, us.total_imports * 3 + us.total_broker_syncs * 2)
            )) > 10 THEN 'exploring'
            ELSE 'new'
          END,
          -- Lifecycle stage
          CASE
            WHEN us.last_login_at IS NOT NULL AND us.last_login_at < NOW() - INTERVAL '30 days' THEN 'churned'
            WHEN us.total_trades > 10 AND us.days_active_30 > 5 THEN 'customer'
            WHEN us.total_trades > 0 OR us.total_imports > 0 THEN 'activated'
            WHEN us.last_login_at IS NOT NULL THEN 'onboarding'
            ELSE 'signed_up'
          END,
          NOW()
        FROM user_stats us
        ON CONFLICT (user_id) DO UPDATE SET
          first_trade_at = EXCLUDED.first_trade_at,
          last_trade_at = EXCLUDED.last_trade_at,
          total_trades = EXCLUDED.total_trades,
          first_import_at = EXCLUDED.first_import_at,
          last_import_at = EXCLUDED.last_import_at,
          total_imports = EXCLUDED.total_imports,
          first_diary_at = EXCLUDED.first_diary_at,
          last_diary_at = EXCLUDED.last_diary_at,
          total_diary_entries = EXCLUDED.total_diary_entries,
          first_broker_sync_at = EXCLUDED.first_broker_sync_at,
          last_broker_sync_at = EXCLUDED.last_broker_sync_at,
          total_broker_syncs = EXCLUDED.total_broker_syncs,
          days_active_last_7 = EXCLUDED.days_active_last_7,
          days_active_last_30 = EXCLUDED.days_active_last_30,
          days_active_last_90 = EXCLUDED.days_active_last_90,
          engagement_score = EXCLUDED.engagement_score,
          engagement_tier = EXCLUDED.engagement_tier,
          lifecycle_stage = EXCLUDED.lifecycle_stage,
          updated_at = NOW()
      `);

      // Update most_used_feature from features_used JSONB
      await db.query(`
        UPDATE user_engagement_summary
        SET most_used_feature = sub.top_feature
        FROM (
          SELECT ues.user_id, (
            SELECT key FROM jsonb_each_text(ues.features_used)
            ORDER BY value::int DESC LIMIT 1
          ) AS top_feature
          FROM user_engagement_summary ues
          WHERE ues.features_used != '{}'::jsonb
        ) sub
        WHERE user_engagement_summary.user_id = sub.user_id
          AND sub.top_feature IS NOT NULL
      `);

      const elapsed = Date.now() - startTime;
      console.log(`[ENGAGEMENT] Recomputation complete (${result.rowCount} users, ${elapsed}ms)`);
    } catch (err) {
      console.error('[ENGAGEMENT] Recomputation error:', err.message);
    } finally {
      this.running = false;
    }
  }

  /**
   * Run retention cleanup - delete activity events older than 90 days
   */
  async cleanupOldEvents() {
    try {
      const result = await db.query(`
        DELETE FROM user_activity_events
        WHERE created_at < NOW() - INTERVAL '90 days'
      `);
      if (result.rowCount > 0) {
        console.log(`[ENGAGEMENT] Cleaned up ${result.rowCount} activity events older than 90 days`);
      }

      // Clean up email engagement older than 1 year
      const emailResult = await db.query(`
        DELETE FROM email_engagement
        WHERE sent_at < NOW() - INTERVAL '1 year'
      `);
      if (emailResult.rowCount > 0) {
        console.log(`[ENGAGEMENT] Cleaned up ${emailResult.rowCount} email engagement records older than 1 year`);
      }
    } catch (err) {
      console.error('[ENGAGEMENT] Cleanup error:', err.message);
    }
  }
}

module.exports = new EngagementScheduler();
