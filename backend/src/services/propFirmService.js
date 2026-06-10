// Prop-Firm Mode
//
// Funded/eval-account traders (Topstep, Apex, Tradovate evals, ProjectX, etc.)
// must obey firm rules: max daily loss, max total drawdown (static or
// trailing), profit target, and minimum trading days. A rule profile attaches
// those limits to a trading account identifier; this service computes live
// status (progress, remaining headroom, breach detection) from imported trades.
//
// IMPORTANT GRANULARITY NOTE: status is computed at DAILY-CLOSE granularity.
// Journal data only contains realized per-trade P&L, not intraday open-equity
// excursions, so an intraday drawdown that recovered before the close is not
// visible here. Breaches are detected against each day's closing equity.
//
// All fields use snake_case (project standard for stored/API data).

const db = require('../config/database');

const PROFILE_COLUMNS = `
  id, user_id, account_identifier, label, account_size,
  max_daily_loss, max_drawdown, drawdown_mode, profit_target,
  min_trading_days, start_date, is_active, created_at, updated_at
`;

// Fields a client may set on create/update (everything else is server-managed)
const WRITABLE_FIELDS = [
  'account_identifier',
  'label',
  'account_size',
  'max_daily_loss',
  'max_drawdown',
  'drawdown_mode',
  'profit_target',
  'min_trading_days',
  'start_date',
  'is_active'
];

function toNumber(value, fallback = 0) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

// Server-local calendar date as 'YYYY-MM-DD'. Built from local date parts on
// purpose: toISOString() is UTC and would shift the date for servers west of
// Greenwich in the evening (and east of it in the morning).
function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// NUMERIC columns come back from pg as strings; normalize for API responses.
function normalizeProfile(row) {
  if (!row) return row;
  return {
    ...row,
    account_size: toNumber(row.account_size),
    max_daily_loss: toNullableNumber(row.max_daily_loss),
    max_drawdown: toNullableNumber(row.max_drawdown),
    profit_target: toNullableNumber(row.profit_target),
    min_trading_days: row.min_trading_days !== null && row.min_trading_days !== undefined
      ? parseInt(row.min_trading_days, 10)
      : null
  };
}

class PropFirmService {
  // List all rule profiles for a user (most recently created first)
  static async listProfiles(userId) {
    const result = await db.query(
      `SELECT ${PROFILE_COLUMNS}
       FROM account_rule_profiles
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(normalizeProfile);
  }

  static async createProfile(userId, data) {
    try {
      const result = await db.query(
        `INSERT INTO account_rule_profiles (
           user_id, account_identifier, label, account_size,
           max_daily_loss, max_drawdown, drawdown_mode, profit_target,
           min_trading_days, start_date, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${PROFILE_COLUMNS}`,
        [
          userId,
          data.account_identifier,
          data.label ?? null,
          data.account_size,
          data.max_daily_loss ?? null,
          data.max_drawdown ?? null,
          data.drawdown_mode || 'static',
          data.profit_target ?? null,
          data.min_trading_days ?? null,
          data.start_date,
          data.is_active ?? true
        ]
      );
      return normalizeProfile(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        const conflict = new Error('A rule profile already exists for this account');
        conflict.code = '23505';
        conflict.statusCode = 409;
        throw conflict;
      }
      throw error;
    }
  }

  // Partial update: only fields present in `data` are written.
  // Returns null when the profile does not exist or is not owned by the user.
  static async updateProfile(id, userId, data) {
    const sets = [];
    const params = [];
    let paramIndex = 1;

    for (const field of WRITABLE_FIELDS) {
      if (data[field] !== undefined) {
        sets.push(`${field} = $${paramIndex++}`);
        params.push(data[field]);
      }
    }

    if (sets.length === 0) {
      // Nothing to update; return the current row so callers get a profile back
      const result = await db.query(
        `SELECT ${PROFILE_COLUMNS} FROM account_rule_profiles WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return normalizeProfile(result.rows[0]) || null;
    }

    sets.push('updated_at = NOW()');
    params.push(id, userId);

    try {
      const result = await db.query(
        `UPDATE account_rule_profiles
         SET ${sets.join(', ')}
         WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
         RETURNING ${PROFILE_COLUMNS}`,
        params
      );
      return normalizeProfile(result.rows[0]) || null;
    } catch (error) {
      if (error.code === '23505') {
        const conflict = new Error('A rule profile already exists for this account');
        conflict.code = '23505';
        conflict.statusCode = 409;
        throw conflict;
      }
      throw error;
    }
  }

  // Returns true when a row was deleted, false when not found / not owned
  static async deleteProfile(id, userId) {
    const result = await db.query(
      'DELETE FROM account_rule_profiles WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rowCount > 0;
  }

  // PURE status computation (exported for tests).
  //
  // `dailyRows` is an array of { trade_date: 'YYYY-MM-DD', daily_pnl: number|string }
  // ordered by trade_date ascending (pg's DATE parser returns plain
  // 'YYYY-MM-DD' strings). Computation is at daily-close granularity: each
  // day's closing equity is checked against the rules; intraday excursions
  // are not available from journal data.
  static computeStatus(profile, dailyRows, now = new Date()) {
    const accountSize = toNumber(profile.account_size);
    const maxDailyLoss = toNullableNumber(profile.max_daily_loss);
    const maxDrawdown = toNullableNumber(profile.max_drawdown);
    const profitTarget = toNullableNumber(profile.profit_target);
    const minTradingDays = profile.min_trading_days !== null && profile.min_trading_days !== undefined
      ? parseInt(profile.min_trading_days, 10)
      : null;
    const isTrailing = profile.drawdown_mode === 'trailing';

    const rows = dailyRows || [];
    const todayStr = localDateString(now);

    let totalPnl = 0;
    let todayPnl = 0;
    let equity = accountSize;
    let highWaterEquity = accountSize;
    // Floor before any trading: static and trailing start at the same place
    let drawdownFloor = maxDrawdown !== null ? accountSize - maxDrawdown : null;
    const breaches = [];

    for (const row of rows) {
      const dayPnl = toNumber(row.daily_pnl);
      totalPnl += dayPnl;
      equity = accountSize + totalPnl;

      if (row.trade_date === todayStr) {
        todayPnl = dayPnl;
      }

      // Daily loss rule: a single day losing more than the limit is a breach
      if (maxDailyLoss !== null && dayPnl < -maxDailyLoss) {
        breaches.push({
          type: 'daily_loss',
          trade_date: row.trade_date,
          amount: round2(dayPnl)
        });
      }

      // Drawdown rule: the trailing floor ratchets up with each new
      // high-water close and never comes back down; the static floor is
      // fixed. A day closing below the then-current floor is a breach.
      // (A new-high day can never breach, so updating the high-water mark
      // before the check is equivalent to checking against the prior floor.)
      if (highWaterEquity < equity) {
        highWaterEquity = equity;
      }
      if (maxDrawdown !== null) {
        drawdownFloor = isTrailing
          ? highWaterEquity - maxDrawdown
          : accountSize - maxDrawdown;
        if (equity < drawdownFloor) {
          breaches.push({
            type: 'drawdown',
            trade_date: row.trade_date,
            amount: round2(equity - drawdownFloor)
          });
        }
      }
    }

    const currentEquity = round2(accountSize + totalPnl);

    // Headroom left today: losses eat into the limit, gains do not extend it
    const dailyLossRemaining = maxDailyLoss !== null
      ? round2(maxDailyLoss + Math.min(todayPnl, 0))
      : null;

    const distanceToFloor = drawdownFloor !== null
      ? round2(currentEquity - drawdownFloor)
      : null;

    const tradingDays = rows.length;
    const minTradingDaysMet = minTradingDays ? tradingDays >= minTradingDays : true;

    const profitTargetProgress = profitTarget
      ? Math.max(0, round1((totalPnl / profitTarget) * 100))
      : null;

    let state = 'on_track';
    if (breaches.length > 0) {
      state = 'breached';
    } else if (profitTarget !== null && totalPnl >= profitTarget && minTradingDaysMet) {
      state = 'passed';
    } else if (
      (dailyLossRemaining !== null && dailyLossRemaining <= 0.25 * maxDailyLoss) ||
      (distanceToFloor !== null && maxDrawdown && distanceToFloor <= 0.25 * maxDrawdown)
    ) {
      state = 'warning';
    }

    return {
      current_equity: currentEquity,
      total_pnl: round2(totalPnl),
      today_pnl: round2(todayPnl),
      daily_loss_remaining: dailyLossRemaining,
      drawdown_floor: drawdownFloor !== null ? round2(drawdownFloor) : null,
      distance_to_floor: distanceToFloor,
      high_water_equity: round2(highWaterEquity),
      profit_target_progress: profitTargetProgress,
      trading_days: tradingDays,
      min_trading_days_met: minTradingDaysMet,
      breaches,
      state
    };
  }

  // Live status for one profile: a single grouped query over the user's
  // trades for the profile's account since its start date.
  static async getStatusForProfile(userId, profile) {
    const result = await db.query(
      `SELECT trade_date, SUM(pnl) AS daily_pnl
       FROM trades
       WHERE user_id = $1
         AND account_identifier = $2
         AND trade_date >= $3
         AND pnl IS NOT NULL
       GROUP BY trade_date
       ORDER BY trade_date`,
      [userId, profile.account_identifier, profile.start_date]
    );
    return PropFirmService.computeStatus(profile, result.rows);
  }

  static async listProfilesWithStatus(userId) {
    const profiles = await PropFirmService.listProfiles(userId);
    return Promise.all(profiles.map(async (profile) => ({
      ...profile,
      status: await PropFirmService.getStatusForProfile(userId, profile)
    })));
  }
}

module.exports = PropFirmService;
