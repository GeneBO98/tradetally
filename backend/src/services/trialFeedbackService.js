const db = require('../config/database');
const {
  TRIAL_FEEDBACK_OPTIONS,
  TRIAL_FEEDBACK_OPTION_VALUES
} = require('../constants/trialFeedbackOptions');

class TrialFeedbackService {
  static getOptions() {
    return TRIAL_FEEDBACK_OPTIONS;
  }

  static isValidReason(reason) {
    return typeof reason === 'string' && TRIAL_FEEDBACK_OPTION_VALUES.has(reason);
  }

  static normalizeFeedbackText(feedbackText) {
    if (typeof feedbackText !== 'string') {
      return null;
    }

    const normalized = feedbackText.trim().slice(0, 2000);
    return normalized || null;
  }

  static mapContextRow(row) {
    if (!row) {
      return null;
    }

    return {
      userId: row.user_id,
      username: row.username,
      trialOverrideId: row.trial_override_id || null,
      trialExpired: !!row.trial_expired,
      trialExpiredAt: row.trial_expired_at || null,
      hasActiveSubscription: !!row.has_active_subscription,
      feedback: row.primary_reason ? {
        primaryReason: row.primary_reason,
        feedbackText: row.feedback_text || '',
        submittedAt: row.feedback_created_at || null,
        updatedAt: row.feedback_updated_at || null
      } : null
    };
  }

  static async getSurveyContext(userId) {
    const result = await db.query(
      `
        SELECT
          u.id AS user_id,
          u.username,
          tor.id AS trial_override_id,
          tor.expires_at AS trial_expired_at,
          (tor.expires_at IS NOT NULL AND tor.expires_at < NOW()) AS trial_expired,
          EXISTS (
            SELECT 1
            FROM subscriptions s
            WHERE s.user_id = u.id
              AND s.status IN ('active', 'trialing')
          ) AS has_active_subscription,
          tnf.primary_reason,
          tnf.feedback_text,
          tnf.created_at AS feedback_created_at,
          tnf.updated_at AS feedback_updated_at
        FROM users u
        LEFT JOIN tier_overrides tor
          ON tor.user_id = u.id
         AND tor.reason ILIKE '%trial%'
        LEFT JOIN trial_nonconversion_feedback tnf
          ON tnf.user_id = u.id
        WHERE u.id = $1
      `,
      [userId]
    );

    return this.mapContextRow(result.rows[0] || null);
  }

  static async submitFeedback(userId, { primaryReason, feedbackText = null }) {
    if (!this.isValidReason(primaryReason)) {
      throw new Error('Invalid primary reason');
    }

    const context = await this.getSurveyContext(userId);
    if (!context) {
      throw new Error('User not found');
    }

    if (!context.trialOverrideId) {
      throw new Error('Trial not found');
    }

    const normalizedFeedbackText = this.normalizeFeedbackText(feedbackText);

    await db.query(
      `
        INSERT INTO trial_nonconversion_feedback (
          user_id,
          tier_override_id,
          primary_reason,
          feedback_text
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE
        SET
          tier_override_id = EXCLUDED.tier_override_id,
          primary_reason = EXCLUDED.primary_reason,
          feedback_text = CASE
            WHEN EXCLUDED.feedback_text IS NULL THEN trial_nonconversion_feedback.feedback_text
            ELSE EXCLUDED.feedback_text
          END,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        userId,
        context.trialOverrideId,
        primaryReason,
        normalizedFeedbackText
      ]
    );

    const updatedContext = await this.getSurveyContext(userId);
    return updatedContext?.feedback || null;
  }

  static async getAdminSummary(limit = 100) {
    const safeLimit = Number.isInteger(limit) && limit > 0
      ? Math.min(limit, 500)
      : 100;

    const [countsResult, recentResult, totalResult] = await Promise.all([
      db.query(
        `
          SELECT primary_reason, COUNT(*)::int AS count
          FROM trial_nonconversion_feedback
          GROUP BY primary_reason
        `
      ),
      db.query(
        `
          SELECT
            tnf.id,
            tnf.user_id,
            u.email,
            u.username,
            tnf.primary_reason,
            tnf.feedback_text,
            tnf.created_at,
            tnf.updated_at,
            tor.expires_at AS trial_expired_at,
            EXISTS (
              SELECT 1
              FROM subscriptions s
              WHERE s.user_id = tnf.user_id
                AND s.status IN ('active', 'trialing')
            ) AS has_active_subscription
          FROM trial_nonconversion_feedback tnf
          INNER JOIN users u ON u.id = tnf.user_id
          LEFT JOIN tier_overrides tor ON tor.id = tnf.tier_override_id
          ORDER BY COALESCE(tnf.updated_at, tnf.created_at) DESC
          LIMIT $1
        `,
        [safeLimit]
      ),
      db.query('SELECT COUNT(*)::int AS count FROM trial_nonconversion_feedback')
    ]);

    const countsByReason = new Map(
      countsResult.rows.map((row) => [row.primary_reason, row.count])
    );

    return {
      totalResponses: totalResult.rows[0]?.count || 0,
      reasonCounts: TRIAL_FEEDBACK_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        count: countsByReason.get(option.value) || 0
      })),
      recentResponses: recentResult.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        email: row.email,
        username: row.username,
        primaryReason: row.primary_reason,
        feedbackText: row.feedback_text || '',
        trialExpiredAt: row.trial_expired_at || null,
        hasActiveSubscription: !!row.has_active_subscription,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    };
  }
}

module.exports = TrialFeedbackService;
