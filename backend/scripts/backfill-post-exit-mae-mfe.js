#!/usr/bin/env node

const db = require('../src/config/database');
const Trade = require('../src/models/Trade');
const User = require('../src/models/User');
const MAEEstimator = require('../src/utils/maeEstimator');
const AnalyticsCache = require('../src/services/analyticsCache');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const userArg = process.argv.find(arg => arg.startsWith('--user-id='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 25;
const userId = userArg ? userArg.split('=')[1] : null;

function positiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function clampMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.max(30, Math.min(Math.round(minutes), 1440));
}

function styleWindowMinutes(styles = []) {
  const normalized = styles.map(style => String(style).toLowerCase());
  if (normalized.some(style => style.includes('scalp'))) return 30;
  if (normalized.some(style => style.includes('day'))) return 120;
  if (normalized.some(style => style.includes('swing'))) return 390;
  if (normalized.some(style => style.includes('position'))) return 1440;
  return null;
}

async function resolveWindow(trade) {
  const overrideMinutes = positiveInt(trade.post_exit_window_override_minutes);
  const exit = new Date(trade.exit_time);

  if (overrideMinutes) {
    const minutes = clampMinutes(overrideMinutes);
    return { minutes, source: 'trade_override', end: new Date(exit.getTime() + minutes * 60000).toISOString() };
  }

  const settings = await User.getSettings(trade.user_id);
  const manualMinutes = positiveInt(settings?.post_exit_excursion_window_minutes);
  if (settings?.post_exit_excursion_window_mode === 'manual' && manualMinutes) {
    const minutes = clampMinutes(manualMinutes);
    return { minutes, source: 'profile_manual', end: new Date(exit.getTime() + minutes * 60000).toISOString() };
  }

  const personalityResult = await db.query(`
    SELECT primary_personality, avg_hold_time_minutes
    FROM trading_personality_profiles
    WHERE user_id = $1
    ORDER BY analysis_end_date DESC, created_at DESC
    LIMIT 1
  `, [trade.user_id]);

  const profile = personalityResult.rows[0];
  const personalityDefaults = { scalper: 30, momentum: 120, mean_reversion: 60, swing: 390 };
  let minutes = profile
    ? (personalityDefaults[profile.primary_personality] || positiveInt(profile.avg_hold_time_minutes))
    : null;
  let source = profile ? 'personality' : 'default';

  if (!minutes) {
    minutes = styleWindowMinutes(settings?.trading_styles || []);
    source = minutes ? 'profile_style' : 'default';
  }

  minutes = clampMinutes(minutes || 60);
  return { minutes, source, end: new Date(exit.getTime() + minutes * 60000).toISOString() };
}

async function main() {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('--limit must be a positive integer');
  }

  const values = [];
  let userFilter = '';
  if (userId) {
    values.push(userId);
    userFilter = `AND user_id = $${values.length}`;
  }
  values.push(limit);

  const result = await db.query(`
    SELECT id, user_id, symbol, side, entry_time, exit_time, entry_price, exit_price, pnl,
           commission, fees, quantity, instrument_type, point_value, underlying_asset,
           contract_size, post_exit_window_override_minutes
    FROM trades
    WHERE exit_time IS NOT NULL
      AND exit_price IS NOT NULL
      AND entry_time IS NOT NULL
      AND entry_price IS NOT NULL
      AND pnl IS NOT NULL
      AND (post_exit_mae IS NULL OR post_exit_mfe IS NULL)
      ${userFilter}
    ORDER BY exit_time DESC
    LIMIT $${values.length}
  `, values);

  console.log(`[INFO] Found ${result.rows.length} trades for post-exit MAE/MFE backfill (${apply ? 'apply' : 'dry-run'})`);

  let updated = 0;
  const invalidatedUsers = new Set();

  for (const trade of result.rows) {
    try {
      if (!MAEEstimator.isValidTradeForEstimation(trade)) continue;
      const window = await resolveWindow(trade);
      const { post_exit_mae, post_exit_mfe } = await MAEEstimator.calculatePostExitFromCandleData(trade, window.end);

      console.log(`${trade.id} ${trade.symbol}: post_exit_mae=${post_exit_mae.toFixed(2)} post_exit_mfe=${post_exit_mfe.toFixed(2)} window=${window.minutes}m source=${window.source}`);

      if (apply) {
        await Trade.update(trade.id, trade.user_id, {
          postExitMae: post_exit_mae,
          postExitMfe: post_exit_mfe,
          postExitWindowMinutes: window.minutes,
          postExitWindowSource: window.source,
          postExitWindowEnd: window.end,
          postExitCalculatedAt: new Date().toISOString()
        }, { skipApiCalls: true });
        updated++;
        invalidatedUsers.add(trade.user_id);
      }
    } catch (error) {
      console.warn(`[WARNING] ${trade.id} ${trade.symbol} skipped: ${error.message}`);
    }
  }

  for (const id of invalidatedUsers) {
    await AnalyticsCache.invalidate(id);
  }

  console.log(`[SUCCESS] ${apply ? 'Updated' : 'Dry-run completed for'} ${apply ? updated : result.rows.length} trades`);
}

main()
  .catch(error => {
    console.error('[ERROR]', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
