const db = require('../config/database');
const AchievementService = require('./achievementService');
const NotificationService = require('./notificationService');
const TierService = require('./tierService');

// Rotating challenges. Each template produces one challenge per period with a
// period-stamped key (e.g. weekly_trading_days_2026-W41), so creation is
// idempotent: ON CONFLICT (key) DO NOTHING. Progress always counts from the
// challenge's start, so everyone in a challenge is measured on the same window.
const CHALLENGE_TEMPLATES = [
  {
    slug: 'trading_days',
    period: 'week',
    name: 'Show Up',
    description: 'Trade on 4 different days this week',
    category: 'behavioral',
    criteria: { type: 'trading_days' },
    targetValue: 4,
    rewardPoints: 60
  },
  {
    slug: 'stop_losses',
    period: 'week',
    name: 'Defined Risk Week',
    description: 'Close 10 trades that had a stop loss set',
    category: 'behavioral',
    criteria: { type: 'trades_with_stop_loss' },
    targetValue: 10,
    rewardPoints: 75
  },
  {
    slug: 'journal',
    period: 'week',
    name: 'Write It Down',
    description: 'Add notes to 5 closed trades this week',
    category: 'learning',
    criteria: { type: 'journaled_trades', min_length: 20 },
    targetValue: 5,
    rewardPoints: 60
  },
  {
    slug: 'revenge_free',
    period: 'week',
    name: 'Revenge-Free Week',
    description: 'Trade on 3 days this week with no revenge trades detected',
    category: 'behavioral',
    criteria: { type: 'revenge_free_days', requires_feature: 'behavioral_analytics' },
    targetValue: 3,
    rewardPoints: 100
  },
  {
    slug: 'journal',
    period: 'month',
    name: 'Trade Journal Month',
    description: 'Add notes to 25 closed trades this month',
    category: 'learning',
    criteria: { type: 'journaled_trades', min_length: 20 },
    targetValue: 25,
    rewardPoints: 150
  },
  {
    slug: 'trading_days',
    period: 'month',
    name: 'Consistency Month',
    description: 'Trade on 15 different days this month',
    category: 'behavioral',
    criteria: { type: 'trading_days' },
    targetValue: 15,
    rewardPoints: 150
  }
];

// Monday 00:00 UTC of the week containing `date`
function startOfWeekUTC(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - weekday);
  return d;
}

// ISO week label, e.g. 2026-W41
function isoWeekLabel(weekStart) {
  const thursday = new Date(weekStart);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function periodFor(template, now) {
  if (template.period === 'week') {
    const start = startOfWeekUTC(now);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end, label: isoWeekLabel(start) };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  return { start, end, label };
}

class ChallengeService {

  // Create this week's and this month's challenges if they don't exist yet
  static async ensureCurrentChallenges(now = new Date()) {
    for (const template of CHALLENGE_TEMPLATES) {
      const { start, end, label } = periodFor(template, now);
      const key = `${template.period === 'week' ? 'weekly' : 'monthly'}_${template.slug}_${label}`;
      await db.query(`
        INSERT INTO challenges (
          key, name, description, category, start_date, end_date,
          criteria, reward_points, is_community, target_value
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)
        ON CONFLICT (key) DO NOTHING
      `, [
        key, template.name, template.description, template.category, start, end,
        JSON.stringify({ ...template.criteria, period: template.period }),
        template.rewardPoints, template.targetValue
      ]);
    }
  }

  static async hasRequiredFeature(userId, criteria) {
    if (!criteria?.requires_feature) return true;
    return TierService.hasFeatureAccess(userId, criteria.requires_feature);
  }

  // Active challenges with this user's participation state
  static async getActiveChallenges(userId) {
    await this.ensureCurrentChallenges();

    const result = await db.query(`
      SELECT
        c.*,
        COUNT(DISTINCT all_uc.user_id)::int AS participant_count,
        COUNT(DISTINCT all_uc.user_id) FILTER (WHERE all_uc.status = 'completed')::int AS completed_count,
        my_uc.status AS user_status,
        my_uc.progress AS user_progress,
        my_uc.started_at AS user_started_at,
        my_uc.completed_at AS user_completed_at
      FROM challenges c
      LEFT JOIN user_challenges all_uc ON all_uc.challenge_id = c.id
      LEFT JOIN user_challenges my_uc ON my_uc.challenge_id = c.id AND my_uc.user_id = $1
      WHERE c.start_date <= CURRENT_TIMESTAMP
        AND c.end_date > CURRENT_TIMESTAMP
      GROUP BY c.id, my_uc.status, my_uc.progress, my_uc.started_at, my_uc.completed_at
      ORDER BY c.end_date ASC, c.reward_points DESC
    `, [userId]);

    const rows = [];
    for (const row of result.rows) {
      rows.push({
        ...row,
        locked: !(await this.hasRequiredFeature(userId, row.criteria))
      });
    }
    return rows;
  }

  // User's challenge history (active first, then completed, then expired)
  static async getUserChallenges(userId) {
    const result = await db.query(`
      SELECT
        c.*,
        uc.status,
        uc.progress,
        uc.started_at,
        uc.completed_at,
        uc.metadata AS user_metadata
      FROM user_challenges uc
      JOIN challenges c ON c.id = uc.challenge_id
      WHERE uc.user_id = $1
      ORDER BY
        CASE uc.status
          WHEN 'active' THEN 1
          WHEN 'completed' THEN 2
          ELSE 3
        END,
        c.end_date DESC
    `, [userId]);
    return result.rows;
  }

  static async joinChallenge(userId, challengeId) {
    const challenge = await db.query(
      'SELECT * FROM challenges WHERE id = $1 AND start_date <= CURRENT_TIMESTAMP AND end_date > CURRENT_TIMESTAMP',
      [challengeId]
    );

    if (challenge.rows.length === 0) {
      throw new Error('Challenge not found or not active');
    }

    const privacyCheck = await db.query(
      'SELECT participate_in_challenges FROM gamification_privacy WHERE user_id = $1',
      [userId]
    );

    if (privacyCheck.rows.length > 0 && !privacyCheck.rows[0].participate_in_challenges) {
      throw new Error('User has disabled challenge participation');
    }

    if (!(await this.hasRequiredFeature(userId, challenge.rows[0].criteria))) {
      throw new Error('Challenge requires a feature the user does not have');
    }

    const result = await db.query(`
      INSERT INTO user_challenges (user_id, challenge_id, status, progress)
      VALUES ($1, $2, 'active', 0)
      ON CONFLICT (user_id, challenge_id) DO NOTHING
      RETURNING *
    `, [userId, challengeId]);

    if (result.rows.length > 0) {
      await NotificationService.sendChallengeJoinedNotification(userId, challenge.rows[0]);
      // Progress counts from the challenge start, so trades already logged
      // this period show up right away
      await this.updateUserChallenges(userId);
    }

    const current = await db.query(
      'SELECT * FROM user_challenges WHERE user_id = $1 AND challenge_id = $2',
      [userId, challengeId]
    );
    return current.rows[0];
  }

  // Recompute progress for one user's active challenges
  static async updateUserChallenges(userId) {
    const active = await db.query(`
      SELECT uc.challenge_id, uc.progress, c.*
      FROM user_challenges uc
      JOIN challenges c ON c.id = uc.challenge_id
      WHERE uc.user_id = $1
        AND uc.status = 'active'
        AND c.end_date > CURRENT_TIMESTAMP
    `, [userId]);

    for (const challenge of active.rows) {
      try {
        const progress = await this.calculateChallengeProgress(userId, challenge);
        if (progress !== Number(challenge.progress)) {
          await this.updateChallengeProgress(userId, challenge, progress);
        }
      } catch (error) {
        console.error(`[CHALLENGE] Failed to update ${challenge.key} for user ${userId}:`, error.message);
      }
    }
  }

  static async updateChallengeProgress(userId, challenge, progress) {
    const target = Number(challenge.target_value) || 1;
    const result = await db.query(`
      UPDATE user_challenges
      SET
        progress = $3::numeric,
        status = CASE WHEN $3::numeric >= $4::numeric THEN 'completed' ELSE status END,
        completed_at = CASE WHEN $3::numeric >= $4::numeric AND completed_at IS NULL THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE user_id = $1 AND challenge_id = $2 AND status = 'active'
      RETURNING *
    `, [userId, challenge.id, progress, target]);

    // The WHERE status = 'active' guard means only one caller can flip a
    // challenge to completed, so the reward is granted exactly once
    if (result.rows.length > 0 && result.rows[0].status === 'completed') {
      await this.awardChallengeCompletion(userId, challenge);
    }
    return result.rows[0];
  }

  static async awardChallengeCompletion(userId, challenge) {
    const reward = challenge.reward_points || 0;
    const before = await AchievementService.getUserStats(userId);
    const oldXP = before.experience_points || 0;
    const newXP = oldXP + reward;
    const beforeInfo = AchievementService.calculateLevelFromXP(oldXP);
    const afterInfo = AchievementService.calculateLevelFromXP(newXP);

    await db.query(`
      INSERT INTO user_gamification_stats (user_id, total_points, experience_points, challenge_count, level)
      VALUES ($1, $2, $2, 1, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        total_points = user_gamification_stats.total_points + $2,
        experience_points = user_gamification_stats.experience_points + $2,
        challenge_count = user_gamification_stats.challenge_count + 1,
        level = $3,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, reward, afterInfo.level]);

    if (challenge.reward_achievement_id) {
      await AchievementService.awardAchievement(userId, challenge.reward_achievement_id, {
        from_challenge: challenge.key
      });
    }

    // XP update goes first: the celebration overlay reads it as the level
    // bar baseline for the completion item that follows
    if (reward > 0) {
      try {
        await NotificationService.sendXPUpdateNotification(userId, {
          oldXP,
          newXP,
          deltaXP: reward,
          oldLevel: beforeInfo.level,
          newLevel: afterInfo.level,
          currentLevelMinXPBefore: beforeInfo.currentLevelMinXP,
          nextLevelMinXPBefore: beforeInfo.nextLevelMinXP,
          currentLevelMinXPAfter: afterInfo.currentLevelMinXP,
          nextLevelMinXPAfter: afterInfo.nextLevelMinXP
        });
      } catch (e) {
        console.warn('[CHALLENGE] Failed to send XP update notification:', e.message);
      }
    }

    await NotificationService.sendChallengeCompletedNotification(userId, challenge);

    if (afterInfo.level > beforeInfo.level) {
      try {
        await NotificationService.sendLevelUpNotification(userId, afterInfo.level, beforeInfo.level);
      } catch (e) {
        console.warn('[CHALLENGE] Failed to send level up notification:', e.message);
      }
    }
  }

  // Scheduler entry point: rotate challenges and refresh every participant
  static async checkAndUpdateChallenges() {
    await this.ensureCurrentChallenges();

    const users = await db.query(`
      SELECT DISTINCT uc.user_id
      FROM user_challenges uc
      JOIN challenges c ON c.id = uc.challenge_id
      WHERE uc.status = 'active' AND c.end_date > CURRENT_TIMESTAMP
    `);

    for (const { user_id: userId } of users.rows) {
      await this.updateUserChallenges(userId);
    }

    await db.query(`
      UPDATE user_challenges
      SET status = 'expired'
      WHERE status = 'active'
        AND challenge_id IN (SELECT id FROM challenges WHERE end_date <= CURRENT_TIMESTAMP)
    `);
  }

  // Progress over [challenge start, min(now, challenge end))
  static async calculateChallengeProgress(userId, challenge) {
    const criteria = challenge.criteria || {};
    const start = challenge.start_date;
    const end = challenge.end_date;

    switch (criteria.type) {
      case 'trading_days': {
        const r = await db.query(`
          SELECT COUNT(DISTINCT DATE(entry_time))::int AS n
          FROM trades
          WHERE user_id = $1 AND entry_time >= $2 AND entry_time < $3
        `, [userId, start, end]);
        return r.rows[0].n;
      }

      case 'trades_with_stop_loss': {
        const r = await db.query(`
          SELECT COUNT(*)::int AS n
          FROM trades
          WHERE user_id = $1 AND exit_time >= $2 AND exit_time < $3
            AND stop_loss IS NOT NULL
        `, [userId, start, end]);
        return r.rows[0].n;
      }

      case 'journaled_trades': {
        const r = await db.query(`
          SELECT COUNT(*)::int AS n
          FROM trades
          WHERE user_id = $1 AND exit_time >= $2 AND exit_time < $3
            AND LENGTH(BTRIM(COALESCE(notes, ''))) >= $4
        `, [userId, start, end, criteria.min_length || 20]);
        return r.rows[0].n;
      }

      case 'revenge_free_days': {
        // Only days a full revenge analysis has covered count, and any
        // detected revenge event in the challenge window resets progress
        const r = await db.query(`
          WITH coverage AS (
            SELECT LEAST(s.revenge_analysis_at, $3::timestamptz) AS until
            FROM user_gamification_stats s
            WHERE s.user_id = $1 AND s.revenge_analysis_at IS NOT NULL
          )
          SELECT
            (SELECT until FROM coverage) AS until,
            (SELECT COUNT(*)::int FROM revenge_trading_events e, coverage
              WHERE e.user_id = $1 AND e.created_at >= $2 AND e.created_at <= coverage.until) AS revenge_events,
            (SELECT COUNT(DISTINCT DATE(t.entry_time))::int FROM trades t, coverage
              WHERE t.user_id = $1 AND t.entry_time >= $2 AND t.entry_time <= coverage.until) AS clean_days
        `, [userId, start, end]);
        const row = r.rows[0];
        if (!row.until || row.revenge_events > 0) return 0;
        return row.clean_days;
      }

      default:
        return 0;
    }
  }

  // Admin-created one-off challenge
  static async createChallenge(challengeData) {
    const {
      key,
      name,
      description,
      category,
      startDate,
      endDate,
      criteria,
      rewardPoints,
      rewardAchievementId,
      isCommunity,
      targetValue
    } = challengeData;

    const result = await db.query(`
      INSERT INTO challenges (
        key, name, description, category, start_date, end_date,
        criteria, reward_points, reward_achievement_id, is_community, target_value
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      key, name, description, category, startDate, endDate,
      criteria, rewardPoints, rewardAchievementId, isCommunity, targetValue
    ]);
    return result.rows[0];
  }

  static async getChallengeLeaderboard(challengeId) {
    const result = await db.query(`
      SELECT
        uc.user_id,
        COALESCE(gp.anonymous_name, generate_anonymous_name(uc.user_id)) as display_name,
        uc.progress,
        uc.completed_at,
        RANK() OVER (ORDER BY uc.progress DESC, uc.completed_at ASC) as rank
      FROM user_challenges uc
      LEFT JOIN gamification_privacy gp ON gp.user_id = uc.user_id
      WHERE uc.challenge_id = $1
        AND uc.status IN ('active', 'completed')
        AND (gp.show_on_leaderboards IS NULL OR gp.show_on_leaderboards = true)
      ORDER BY rank
      LIMIT 100
    `, [challengeId]);
    return result.rows;
  }
}

ChallengeService.CHALLENGE_TEMPLATES = CHALLENGE_TEMPLATES;
ChallengeService.periodFor = periodFor;

module.exports = ChallengeService;
