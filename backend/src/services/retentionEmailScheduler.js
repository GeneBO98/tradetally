const db = require('../config/database');
const EmailService = require('./emailService');
const TierService = require('./tierService');
const weeklyInsights = require('./weeklyDigest/insights');
const aiRecap = require('./weeklyDigest/aiRecap');

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) return `**@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
}

/**
 * Sends weekly digest and inactive re-engagement emails.
 * Weekly digest: Monday only, to users with trades in the last 7 days.
 * Re-engagement: users with no login in 14 days (at most once per 14 days per user).
 */
class RetentionEmailScheduler {
  static async runScheduledTasks() {
    try {
      console.log('[START] Running retention email scheduled tasks...');
      const now = new Date();
      const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday

      if (dayOfWeek === 1) {
        await this.sendWeeklyDigests();
      }
      await this.sendReengagementEmails();
      await this.sendAtRiskFollowupEmails();
      await this.sendChurnedNoImportsEmails();
      await this.sendTrialConversionEmails();
      await this.sendReviewRequestEmails();
      console.log('[SUCCESS] Retention email tasks completed');
    } catch (error) {
      console.error('[ERROR] Error running retention email tasks:', error);
    }
  }

  /**
   * Send "Your week in trades" to users who had trades in the last 7 days.
   */
  static async sendWeeklyDigests() {
    try {
      console.log('[EMAIL] Sending weekly digests...');
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const aggregates = await weeklyInsights.fetchWeeklyAggregates(startStr, endStr);
      if (aggregates.length === 0) {
        console.log('No weekly digests to send');
        return;
      }

      const frontendUrl = process.env.FRONTEND_URL || 'https://tradetally.io';
      const dashboardUrl = `${frontendUrl}/dashboard`;
      let aiRecapCount = 0;

      for (const agg of aggregates) {
        try {
          const highlight = weeklyInsights.pickHighlight(agg, {
            startDate: startStr,
            endDate: endStr,
            frontendUrl,
          });

          const tier = await TierService.getUserTier(agg.userId);
          const isPro = tier === 'pro';

          let recap = null;
          if (isPro) {
            recap = await aiRecap.generateRecap(agg.userId, agg, startStr, endStr);
            if (recap) aiRecapCount++;
          }

          await EmailService.sendWeeklyDigestEmail(
            agg.email,
            agg.username || agg.fullName || 'there',
            {
              tradeCount: agg.tradeCount,
              totalPnL: agg.totalPnL,
              dashboardUrl,
              highlight,
              aiRecap: recap,
              isPro,
            },
            agg.userId
          );
        } catch (err) {
          console.error(`Failed to send weekly digest to ${maskEmail(agg.email)}:`, err.message);
        }
      }
      console.log(`Weekly digests sent: ${aggregates.length} (AI recaps: ${aiRecapCount})`);
    } catch (error) {
      console.error('Error sending weekly digests:', error);
    }
  }

  /**
   * Send re-engagement email to users inactive for 14+ days. At most once per 14 days per user.
   */
  static async sendReengagementEmails() {
    try {
      console.log('[EMAIL] Checking for inactive users to re-engage...');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cutoffIso = cutoff.toISOString();

      const query = `
        SELECT id, email, username, full_name
        FROM users
        WHERE is_active = true
          AND (last_login_at IS NULL OR last_login_at < $1)
          AND (reengagement_email_sent_at IS NULL OR reengagement_email_sent_at < $1)
          AND marketing_consent = true
      `;
      const result = await db.query(query, [cutoffIso]);
      if (result.rows.length === 0) {
        console.log('No re-engagement emails to send');
        return;
      }
      for (const row of result.rows) {
        try {
          await EmailService.sendInactiveReengagementEmail(
            row.email,
            row.username || row.full_name || 'there',
            14,
            row.id // Pass userId for personalized unsubscribe link
          );
          await db.query(
            'UPDATE users SET reengagement_email_sent_at = NOW() WHERE id = $1',
            [row.id]
          );
        } catch (err) {
          console.error(`Failed to send re-engagement to ${maskEmail(row.email)}:`, err.message);
        }
      }
      console.log(`Re-engagement emails sent: ${result.rows.length}`);
    } catch (error) {
      console.error('Error sending re-engagement emails:', error);
    }
  }

  /**
   * Send feature-focused follow-up emails to users who are drifting toward churn.
   * Targets users already classified as dormant/at-risk in user_engagement_summary.
   * Throttled to once every 21 days per user.
   */
  static async sendAtRiskFollowupEmails() {
    try {
      console.log('[EMAIL] Checking for at-risk users to follow up...');

      const query = `
        SELECT
          u.id,
          u.email,
          u.username,
          u.full_name,
          ues.days_active_last_30,
          ues.total_trades,
          ues.total_imports,
          ues.total_diary_entries,
          ues.total_broker_syncs,
          ues.last_feature_used,
          COALESCE(ues.features_used, '{}'::jsonb) AS features_used
        FROM user_engagement_summary ues
        INNER JOIN users u ON u.id = ues.user_id
        WHERE u.is_active = true
          AND u.marketing_consent = true
          AND ues.engagement_tier = 'dormant'
          AND ues.lifecycle_stage IN ('activated', 'customer')
          AND COALESCE(ues.total_trades, 0) + COALESCE(ues.total_imports, 0) + COALESCE(ues.total_diary_entries, 0) + COALESCE(ues.total_broker_syncs, 0) > 0
          AND NOT EXISTS (
            SELECT 1
            FROM email_log el
            WHERE el.user_id = u.id
              AND el.email_type = 'at_risk_followup'
              AND el.status = 'sent'
              AND el.sent_at > NOW() - INTERVAL '21 days'
          )
      `;

      const result = await db.query(query);
      if (result.rows.length === 0) {
        console.log('No at-risk follow-up emails to send');
        return;
      }

      for (const row of result.rows) {
        try {
          await EmailService.sendAtRiskFollowupEmail(
            row.email,
            row.username || row.full_name || 'there',
            {
              daysActiveLast30: row.days_active_last_30 || 0,
              totalTrades: row.total_trades || 0,
              totalImports: row.total_imports || 0,
              totalDiaryEntries: row.total_diary_entries || 0,
              totalBrokerSyncs: row.total_broker_syncs || 0,
              lastFeatureUsed: row.last_feature_used || null,
              featuresUsed: row.features_used || {}
            },
            row.id
          );
        } catch (err) {
          console.error(`Failed to send at-risk follow-up to ${maskEmail(row.email)}:`, err.message);
        }
      }

      console.log(`At-risk follow-up emails sent: ${result.rows.length}`);
    } catch (error) {
      console.error('Error sending at-risk follow-up emails:', error);
    }
  }

  /**
   * Send a win-back email to churned users who never got to a successful import.
   * Focuses on parser improvements and import onboarding.
   * Throttled to once every 45 days per user.
   */
  static async sendChurnedNoImportsEmails() {
    try {
      console.log('[EMAIL] Checking for churned users with no imports...');

      const query = `
        SELECT
          u.id,
          u.email,
          u.username,
          u.full_name,
          ues.total_imports,
          ues.total_trades,
          ues.last_feature_used,
          COALESCE((
            SELECT COUNT(*)
            FROM unknown_csv_headers uch
            WHERE uch.user_id = u.id
              AND uch.created_at > NOW() - INTERVAL '120 days'
              AND uch.outcome IN ('parse_failed', 'zero_trades', 'zero_imported')
          ), 0)::int AS recent_import_failures
        FROM user_engagement_summary ues
        INNER JOIN users u ON u.id = ues.user_id
        WHERE u.is_active = true
          AND u.marketing_consent = true
          AND ues.lifecycle_stage = 'churned'
          AND COALESCE(ues.total_imports, 0) = 0
          AND COALESCE(ues.total_trades, 0) = 0
          AND NOT EXISTS (
            SELECT 1
            FROM email_log el
            WHERE el.user_id = u.id
              AND el.email_type = 'churned_no_imports_followup'
              AND el.status = 'sent'
              AND el.sent_at > NOW() - INTERVAL '45 days'
          )
      `;

      const result = await db.query(query);
      if (result.rows.length === 0) {
        console.log('No churned no-import follow-up emails to send');
        return;
      }

      for (const row of result.rows) {
        try {
          await EmailService.sendChurnedNoImportsFollowupEmail(
            row.email,
            row.username || row.full_name || 'there',
            {
              recentImportFailures: row.recent_import_failures || 0,
              lastFeatureUsed: row.last_feature_used || null
            },
            row.id
          );
        } catch (err) {
          console.error(`Failed to send churned no-import follow-up to ${maskEmail(row.email)}:`, err.message);
        }
      }

      console.log(`Churned no-import follow-up emails sent: ${result.rows.length}`);
    } catch (error) {
      console.error('Error sending churned no-import follow-up emails:', error);
    }
  }

  /**
   * Send conversion emails to users whose Pro trial expired 3-7 days ago without subscribing.
   * Sends once per user (tracks conversion_email_sent_at on tier_overrides).
   */
  static async sendTrialConversionEmails() {
    try {
      console.log('[EMAIL] Checking for expired trial users to send conversion emails...');

      const query = `
        SELECT
          u.id AS user_id,
          u.email,
          u.username,
          u.full_name,
          tor.expires_at,
          EXTRACT(DAY FROM NOW() - tor.expires_at)::int AS days_since_expiry,
          tor.reason AS trial_type,
          COALESCE(stats.total_trades, 0)::int AS total_trades,
          COALESCE(stats.win_rate, 0)::double precision AS win_rate,
          COALESCE(stats.total_pnl, 0)::double precision AS total_pnl,
          stats.top_symbol,
          stats.brokers_used
        FROM tier_overrides tor
        INNER JOIN users u ON u.id = tor.user_id
          AND u.is_active = true
          AND u.marketing_consent = true
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS total_trades,
            CASE WHEN COUNT(*) > 0
              THEN (COUNT(*) FILTER (WHERE t.pnl > 0) * 100.0 / COUNT(*))
              ELSE 0
            END AS win_rate,
            COALESCE(SUM(t.pnl), 0) AS total_pnl,
            (SELECT t2.symbol FROM trades t2 WHERE t2.user_id = u.id GROUP BY t2.symbol ORDER BY COUNT(*) DESC LIMIT 1) AS top_symbol,
            STRING_AGG(DISTINCT t.broker, ', ') AS brokers_used
          FROM trades t
          WHERE t.user_id = u.id
        ) stats ON true
        WHERE tor.expires_at < NOW()
          AND tor.expires_at > NOW() - INTERVAL '7 days'
          AND tor.expires_at < NOW() - INTERVAL '3 days'
          AND tor.reason ILIKE '%trial%'
          AND tor.conversion_email_sent_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.user_id = u.id
              AND s.status IN ('active', 'trialing')
          )
      `;

      const result = await db.query(query);
      if (result.rows.length === 0) {
        console.log('No trial conversion emails to send');
        return;
      }

      for (const row of result.rows) {
        try {
          await EmailService.sendTrialConversionEmail(
            row.email,
            row.username || row.full_name || 'there',
            {
              totalTrades: row.total_trades,
              winRate: parseFloat(row.win_rate) || 0,
              totalPnL: parseFloat(row.total_pnl) || 0,
              topSymbol: row.top_symbol || null,
              brokersUsed: row.brokers_used || null,
              trialType: row.trial_type || 'trial',
              daysSinceExpiry: row.days_since_expiry || 0
            },
            row.user_id
          );
          await db.query(
            'UPDATE tier_overrides SET conversion_email_sent_at = NOW() WHERE user_id = $1 AND reason ILIKE $2',
            [row.user_id, '%trial%']
          );
        } catch (err) {
          console.error(`Failed to send trial conversion email to ${maskEmail(row.email)}:`, err.message);
        }
      }
      console.log(`Trial conversion emails sent: ${result.rows.length}`);
    } catch (error) {
      console.error('Error sending trial conversion emails:', error);
    }
  }

  /**
   * Send review request emails to Pro subscribers ~30 days after subscription start.
   * Sends once per user. Only targets users with meaningful recent activity.
   *
   * Activity filter (at least one of):
   *   - 3+ logins in the last 30 days
   *   - 1+ trade import
   *   - 10+ trades added/edited
   *   - 1+ AI/analytics session
   */
  static async sendReviewRequestEmails() {
    try {
      console.log('[EMAIL] Checking for Pro subscribers eligible for review request...');

      const reviewUrl = process.env.REVIEW_URL || `${process.env.FRONTEND_URL || 'https://tradetally.io'}/review`;

      const query = `
        SELECT
          u.id AS user_id,
          u.email,
          u.username,
          u.full_name
        FROM subscriptions s
        INNER JOIN users u ON u.id = s.user_id
          AND u.is_active = true
          AND u.marketing_consent = true
        WHERE s.status IN ('active', 'trialing')
          AND s.created_at <= NOW() - INTERVAL '30 days'
          AND s.review_email_sent_at IS NULL
          AND (
            -- At least 3 logins in the last 30 days
            (SELECT COUNT(*) FROM user_activity_events ae
             WHERE ae.user_id = u.id
               AND ae.event_type = 'auth.login'
               AND ae.created_at > NOW() - INTERVAL '30 days') >= 3
            OR
            -- At least 1 import
            (SELECT COUNT(*) FROM user_activity_events ae
             WHERE ae.user_id = u.id
               AND ae.event_type = 'trade.imported'
               AND ae.created_at > NOW() - INTERVAL '30 days') >= 1
            OR
            -- At least 10 trades added/edited
            (SELECT COUNT(*) FROM user_activity_events ae
             WHERE ae.user_id = u.id
               AND ae.event_type IN ('trade.created', 'trade.updated')
               AND ae.created_at > NOW() - INTERVAL '30 days') >= 10
            OR
            -- At least 1 AI/analytics session
            (SELECT COUNT(*) FROM user_activity_events ae
             WHERE ae.user_id = u.id
               AND ae.event_category = 'ai'
               AND ae.created_at > NOW() - INTERVAL '30 days') >= 1
          )
      `;

      const result = await db.query(query);
      if (result.rows.length === 0) {
        console.log('No review request emails to send');
        return;
      }

      for (const row of result.rows) {
        try {
          await EmailService.sendReviewRequestEmail(
            row.email,
            row.username || row.full_name || 'there',
            reviewUrl,
            row.user_id
          );
          await db.query(
            'UPDATE subscriptions SET review_email_sent_at = NOW() WHERE user_id = $1',
            [row.user_id]
          );
        } catch (err) {
          console.error(`Failed to send review request to ${maskEmail(row.email)}:`, err.message);
        }
      }
      console.log(`Review request emails sent: ${result.rows.length}`);
    } catch (error) {
      console.error('Error sending review request emails:', error);
    }
  }

  static startScheduler() {
    console.log('[START] Starting retention email scheduler...');
    this.runScheduledTasks();
    this._interval = setInterval(() => {
      this.runScheduledTasks();
    }, 24 * 60 * 60 * 1000); // Every 24 hours
    console.log('[SUCCESS] Retention email scheduler started (runs daily)');
  }

  static stopScheduler() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
      console.log('[INFO] Retention email scheduler stopped');
    }
  }
}

module.exports = RetentionEmailScheduler;
