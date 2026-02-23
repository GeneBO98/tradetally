const db = require('../config/database');
const EmailService = require('./emailService');

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

      // Only send to users with marketing_consent = true
      const query = `
        SELECT
          t.user_id,
          u.email,
          u.username,
          u.full_name,
          COUNT(*)::int AS trade_count,
          COALESCE(SUM(t.pnl), 0)::double precision AS total_pnl
        FROM trades t
        INNER JOIN users u ON u.id = t.user_id AND u.is_active = true AND u.marketing_consent = true
        WHERE t.trade_date >= $1::date AND t.trade_date <= $2::date
        GROUP BY t.user_id, u.email, u.username, u.full_name
        HAVING COUNT(*) > 0
      `;
      const result = await db.query(query, [startStr, endStr]);
      if (result.rows.length === 0) {
        console.log('No weekly digests to send');
        return;
      }
      const dashboardUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/dashboard` : null;
      for (const row of result.rows) {
        try {
          await EmailService.sendWeeklyDigestEmail(
            row.email,
            row.username || row.full_name || 'there',
            {
              tradeCount: row.trade_count,
              totalPnL: parseFloat(row.total_pnl) || 0,
              dashboardUrl
            },
            row.user_id // Pass userId for personalized unsubscribe link
          );
        } catch (err) {
          console.error(`Failed to send weekly digest to ${maskEmail(row.email)}:`, err.message);
        }
      }
      console.log(`Weekly digests sent: ${result.rows.length}`);
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
