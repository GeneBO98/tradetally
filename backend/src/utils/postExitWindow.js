// Resolves how long after exit a trade's post-exit MAE/MFE window should
// extend. Extracted from trade.controller.js so the durable mae_recalc job
// can compute post-exit excursions with the same window logic as the
// create/update request paths.
//
// Resolution order: per-trade override -> profile manual setting ->
// trading-personality profile -> trading-style heuristic -> 60min default.

const db = require('../config/database');
const User = require('../models/User');

function getPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveStyleWindowMinutes(styles = []) {
  const normalized = styles.map(style => String(style).toLowerCase());
  if (normalized.some(style => style.includes('scalp'))) return 30;
  if (normalized.some(style => style.includes('day'))) return 120;
  if (normalized.some(style => style.includes('swing'))) return 390;
  if (normalized.some(style => style.includes('position'))) return 1440;
  return null;
}

function clampPostExitMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.max(30, Math.min(Math.round(minutes), 1440));
}

async function resolvePostExitWindow(userId, trade) {
  const exitTime = trade.exit_time || trade.exitTime;
  if (!exitTime || isNaN(new Date(exitTime))) return null;

  const tradeOverride = getPositiveInt(trade.post_exit_window_override_minutes || trade.postExitWindowOverrideMinutes);
  if (tradeOverride) {
    return {
      minutes: clampPostExitMinutes(tradeOverride),
      source: 'trade_override',
      end: new Date(new Date(exitTime).getTime() + clampPostExitMinutes(tradeOverride) * 60000).toISOString()
    };
  }

  const settings = await User.getSettings(userId);
  const manualMinutes = getPositiveInt(settings?.post_exit_excursion_window_minutes);
  if (settings?.post_exit_excursion_window_mode === 'manual' && manualMinutes) {
    return {
      minutes: clampPostExitMinutes(manualMinutes),
      source: 'profile_manual',
      end: new Date(new Date(exitTime).getTime() + clampPostExitMinutes(manualMinutes) * 60000).toISOString()
    };
  }

  const personalityResult = await db.query(`
    SELECT primary_personality, avg_hold_time_minutes
    FROM trading_personality_profiles
    WHERE user_id = $1
    ORDER BY analysis_end_date DESC, created_at DESC
    LIMIT 1
  `, [userId]);

  const profile = personalityResult.rows[0];
  const personalityDefaults = {
    scalper: 30,
    momentum: 120,
    mean_reversion: 60,
    swing: 390,
    hybrid: null
  };

  let inferredMinutes = null;
  let source = 'default';

  if (profile) {
    inferredMinutes = personalityDefaults[profile.primary_personality] || getPositiveInt(profile.avg_hold_time_minutes);
    source = 'personality';
  }

  if (!inferredMinutes) {
    inferredMinutes = resolveStyleWindowMinutes(settings?.trading_styles || []);
    source = inferredMinutes ? 'profile_style' : 'default';
  }

  const minutes = clampPostExitMinutes(inferredMinutes || 60);
  return {
    minutes,
    source,
    end: new Date(new Date(exitTime).getTime() + minutes * 60000).toISOString()
  };
}

module.exports = {
  resolvePostExitWindow,
  clampPostExitMinutes,
  resolveStyleWindowMinutes,
  getPositiveInt
};
