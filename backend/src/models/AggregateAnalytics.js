const db = require('../config/database');

// Privacy thresholds to prevent individual identification
const MIN_TRADES = 10;
const MIN_USERS = 3;

// No thresholds for admin view or when instrument type filter is active
const ADMIN_MIN_TRADES = 1;
const ADMIN_MIN_USERS = 1;

class AggregateAnalytics {
  /**
   * Build a date filter clause for a given period
   */
  static getDateFilter(period, paramIndex = 1, column = 't.entry_time') {
    if (!period || period === 'all') {
      return { clause: '', params: [], nextIndex: paramIndex };
    }
    const days = period === '30d' ? 30 : period === '90d' ? 90 : period === '180d' ? 180 : 365;
    return {
      clause: ` AND ${column} >= NOW() - INTERVAL '${days} days'`,
      params: [],
      nextIndex: paramIndex
    };
  }

  /**
   * Build an instrument type filter clause
   */
  static getInstrumentTypeFilter(instrumentTypes, paramIndex = 1, column = 't.instrument_type') {
    if (!instrumentTypes || instrumentTypes.length === 0) {
      return { clause: '', params: [], nextIndex: paramIndex };
    }
    const placeholders = instrumentTypes.map((_, i) => `$${paramIndex + i}`).join(', ');
    return {
      clause: ` AND ${column} IN (${placeholders})`,
      params: [...instrumentTypes],
      nextIndex: paramIndex + instrumentTypes.length
    };
  }

  /**
   * Get privacy thresholds based on options
   * - Admin view: no minimums
   * - Instrument type filter active: relaxed thresholds
   * - Default: standard thresholds
   */
  static getThresholds(options = {}) {
    if (options.isAdmin) {
      return { minTrades: ADMIN_MIN_TRADES, minUsers: ADMIN_MIN_USERS };
    }
    if (options.instrumentTypes && options.instrumentTypes.length > 0) {
      return { minTrades: ADMIN_MIN_TRADES, minUsers: ADMIN_MIN_USERS };
    }
    return { minTrades: MIN_TRADES, minUsers: MIN_USERS };
  }

  /**
   * Returns a JOIN clause that excludes opted-out users.
   * @param {string} userIdColumn - The column referencing user_id (e.g. 't.user_id')
   */
  static getOptOutFilter(userIdColumn = 't.user_id') {
    return `JOIN user_settings us_optout ON us_optout.user_id = ${userIdColumn} AND (us_optout.contribute_anonymous_data IS NULL OR us_optout.contribute_anonymous_data = true)`;
  }

  /**
   * Overview stats: total trades, active traders, symbols traded, overall win rate
   */
  static async getOverviewStats(period = 'all', options = {}) {
    const dateFilter = this.getDateFilter(period);
    const instFilter = this.getInstrumentTypeFilter(options.instrumentTypes, dateFilter.nextIndex);

    const query = `
      SELECT
        COUNT(*)::int AS total_trades,
        COUNT(DISTINCT t.user_id)::int AS active_traders,
        COUNT(DISTINCT t.symbol)::int AS symbols_traded,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE t.pnl > 0) / NULLIF(COUNT(*) FILTER (WHERE t.pnl IS NOT NULL), 0),
          1
        ) AS overall_win_rate,
        ROUND(SUM(t.pnl)::numeric, 2) AS total_pnl,
        ROUND(AVG(t.pnl)::numeric, 2) AS avg_pnl_per_trade,
        ROUND(AVG(ABS(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 60))::numeric, 1) AS avg_hold_time_minutes
      FROM trades t
      ${this.getOptOutFilter()}
      WHERE t.pnl IS NOT NULL
        ${dateFilter.clause}
        ${instFilter.clause}
    `;

    const result = await db.query(query, [...dateFilter.params, ...instFilter.params]);
    return result.rows[0] || {};
  }

  /**
   * Get instrument types that have trades (for populating filter options)
   */
  static async getAvailableInstrumentTypes(period = 'all') {
    const dateFilter = this.getDateFilter(period);

    const query = `
      SELECT
        t.instrument_type,
        COUNT(*)::int AS trade_count
      FROM trades t
      ${this.getOptOutFilter()}
      WHERE t.pnl IS NOT NULL AND t.instrument_type IS NOT NULL
        ${dateFilter.clause}
      GROUP BY t.instrument_type
      ORDER BY trade_count DESC
    `;

    const result = await db.query(query, dateFilter.params);
    return result.rows;
  }

  /**
   * Symbol performance: top/bottom symbols by avg P&L
   */
  static async getSymbolPerformance(period = 'all', limit = 50, options = {}) {
    const dateFilter = this.getDateFilter(period);
    const instFilter = this.getInstrumentTypeFilter(options.instrumentTypes, dateFilter.nextIndex);
    const { minTrades, minUsers } = this.getThresholds(options);

    const query = `
      SELECT
        t.symbol,
        COUNT(*)::int AS trade_count,
        COUNT(DISTINCT t.user_id)::int AS user_count,
        ROUND(AVG(t.pnl)::numeric, 2) AS avg_pnl,
        ROUND(SUM(t.pnl)::numeric, 2) AS total_pnl,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE t.pnl > 0) / NULLIF(COUNT(*), 0),
          1
        ) AS win_rate,
        ROUND(AVG(t.pnl) FILTER (WHERE t.pnl > 0)::numeric, 2) AS avg_win,
        ROUND(AVG(t.pnl) FILTER (WHERE t.pnl < 0)::numeric, 2) AS avg_loss,
        ROUND(AVG(t.r_value)::numeric, 2) AS avg_r_value
      FROM trades t
      ${this.getOptOutFilter()}
      WHERE t.pnl IS NOT NULL
        ${dateFilter.clause}
        ${instFilter.clause}
      GROUP BY t.symbol
      HAVING COUNT(*) >= ${minTrades} AND COUNT(DISTINCT t.user_id) >= ${minUsers}
      ORDER BY avg_pnl DESC
      LIMIT $${instFilter.nextIndex}
    `;

    const result = await db.query(query, [...dateFilter.params, ...instFilter.params, limit]);
    return result.rows;
  }

  /**
   * Time-of-day analysis: hourly and day-of-week P&L distribution
   */
  static async getTimeOfDayAnalysis(period = 'all', options = {}) {
    const dateFilter = this.getDateFilter(period);
    const instFilter = this.getInstrumentTypeFilter(options.instrumentTypes, dateFilter.nextIndex);
    const allParams = [...dateFilter.params, ...instFilter.params];
    const { minTrades, minUsers } = this.getThresholds(options);

    const hourlyQuery = `
      SELECT
        EXTRACT(HOUR FROM t.entry_time)::int AS hour,
        COUNT(*)::int AS trade_count,
        COUNT(DISTINCT t.user_id)::int AS user_count,
        ROUND(AVG(t.pnl)::numeric, 2) AS avg_pnl,
        ROUND(SUM(t.pnl)::numeric, 2) AS total_pnl,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE t.pnl > 0) / NULLIF(COUNT(*), 0),
          1
        ) AS win_rate
      FROM trades t
      ${this.getOptOutFilter()}
      WHERE t.pnl IS NOT NULL AND t.entry_time IS NOT NULL
        ${dateFilter.clause}
        ${instFilter.clause}
      GROUP BY EXTRACT(HOUR FROM t.entry_time)
      HAVING COUNT(*) >= ${minTrades} AND COUNT(DISTINCT t.user_id) >= ${minUsers}
      ORDER BY hour
    `;

    const dowQuery = `
      SELECT
        EXTRACT(DOW FROM t.entry_time)::int AS day_of_week,
        COUNT(*)::int AS trade_count,
        COUNT(DISTINCT t.user_id)::int AS user_count,
        ROUND(AVG(t.pnl)::numeric, 2) AS avg_pnl,
        ROUND(SUM(t.pnl)::numeric, 2) AS total_pnl,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE t.pnl > 0) / NULLIF(COUNT(*), 0),
          1
        ) AS win_rate
      FROM trades t
      ${this.getOptOutFilter()}
      WHERE t.pnl IS NOT NULL AND t.entry_time IS NOT NULL
        ${dateFilter.clause}
        ${instFilter.clause}
      GROUP BY EXTRACT(DOW FROM t.entry_time)
      HAVING COUNT(*) >= ${minTrades} AND COUNT(DISTINCT t.user_id) >= ${minUsers}
      ORDER BY day_of_week
    `;

    const [hourlyResult, dowResult] = await Promise.all([
      db.query(hourlyQuery, allParams),
      db.query(dowQuery, allParams)
    ]);

    return {
      hourly: hourlyResult.rows,
      day_of_week: dowResult.rows
    };
  }

  /**
   * Strategy analysis: win rate, profit factor, avg R-value per strategy
   */
  static async getStrategyAnalysis(period = 'all', limit = 50, options = {}) {
    const dateFilter = this.getDateFilter(period);
    const instFilter = this.getInstrumentTypeFilter(options.instrumentTypes, dateFilter.nextIndex);
    const { minTrades, minUsers } = this.getThresholds(options);

    const query = `
      SELECT
        t.strategy,
        COUNT(*)::int AS trade_count,
        COUNT(DISTINCT t.user_id)::int AS user_count,
        ROUND(AVG(t.pnl)::numeric, 2) AS avg_pnl,
        ROUND(SUM(t.pnl)::numeric, 2) AS total_pnl,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE t.pnl > 0) / NULLIF(COUNT(*), 0),
          1
        ) AS win_rate,
        ROUND(
          COALESCE(
            SUM(t.pnl) FILTER (WHERE t.pnl > 0) / NULLIF(ABS(SUM(t.pnl) FILTER (WHERE t.pnl < 0)), 0),
            0
          )::numeric, 2
        ) AS profit_factor,
        ROUND(AVG(t.r_value)::numeric, 2) AS avg_r_value,
        ROUND(AVG(ABS(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 60))::numeric, 1) AS avg_hold_time_minutes
      FROM trades t
      ${this.getOptOutFilter()}
      WHERE t.pnl IS NOT NULL AND t.strategy IS NOT NULL AND t.strategy != ''
        ${dateFilter.clause}
        ${instFilter.clause}
      GROUP BY t.strategy
      HAVING COUNT(*) >= ${minTrades} AND COUNT(DISTINCT t.user_id) >= ${minUsers}
      ORDER BY trade_count DESC
      LIMIT $${instFilter.nextIndex}
    `;

    const result = await db.query(query, [...dateFilter.params, ...instFilter.params, limit]);
    return result.rows;
  }

  /**
   * Behavioral patterns: aggregate from behavioral_patterns and revenge_trading_events
   */
  static async getBehavioralPatterns(period = 'all', options = {}) {
    const dateFilter = this.getDateFilter(period, 1, 'bp.detected_at');
    const revengeDateFilter = this.getDateFilter(period, 1, 'rte.trigger_timestamp');
    const { minUsers } = this.getThresholds(options);

    // Note: behavioral_patterns and revenge_trading_events don't have instrument_type
    // so we don't apply instrument type filter here
    const patternsQuery = `
      SELECT
        bp.pattern_type,
        bp.severity,
        COUNT(*)::int AS occurrence_count,
        COUNT(DISTINCT bp.user_id)::int AS affected_users,
        ROUND(AVG(bp.confidence_score)::numeric, 2) AS avg_confidence
      FROM behavioral_patterns bp
      JOIN user_settings us_optout ON us_optout.user_id = bp.user_id AND (us_optout.contribute_anonymous_data IS NULL OR us_optout.contribute_anonymous_data = true)
      WHERE 1=1
        ${dateFilter.clause}
      GROUP BY bp.pattern_type, bp.severity
      HAVING COUNT(DISTINCT bp.user_id) >= ${minUsers}
      ORDER BY occurrence_count DESC
    `;

    const revengeQuery = `
      SELECT
        COUNT(*)::int AS total_events,
        COUNT(DISTINCT rte.user_id)::int AS affected_users,
        ROUND(AVG(rte.total_additional_loss)::numeric, 2) AS avg_additional_loss,
        ROUND(AVG(rte.total_revenge_trades)::numeric, 1) AS avg_revenge_trades_per_event,
        ROUND(AVG(rte.time_window_minutes)::numeric, 0) AS avg_time_window_minutes,
        ROUND(AVG(rte.position_size_increase_percent)::numeric, 1) AS avg_position_size_increase,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE rte.pattern_broken = true) / NULLIF(COUNT(*), 0),
          1
        ) AS pattern_broken_rate
      FROM revenge_trading_events rte
      JOIN user_settings us_optout ON us_optout.user_id = rte.user_id AND (us_optout.contribute_anonymous_data IS NULL OR us_optout.contribute_anonymous_data = true)
      WHERE 1=1
        ${revengeDateFilter.clause}
      HAVING COUNT(DISTINCT rte.user_id) >= ${minUsers}
    `;

    const [patternsResult, revengeResult] = await Promise.all([
      db.query(patternsQuery, dateFilter.params),
      db.query(revengeQuery, revengeDateFilter.params)
    ]);

    return {
      patterns: patternsResult.rows,
      revenge_trading: revengeResult.rows[0] || null
    };
  }

  // ========== Phase 2: Enhanced Aggregate Queries ==========

  /**
   * Hold time comparison: avg hold time for winners vs losers
   */
  static async getHoldTimeComparison(period = 'all', options = {}) {
    const dateFilter = this.getDateFilter(period);
    const instFilter = this.getInstrumentTypeFilter(options.instrumentTypes, dateFilter.nextIndex);

    const query = `
      SELECT
        CASE WHEN t.pnl > 0 THEN 'winner' ELSE 'loser' END AS outcome,
        COUNT(*)::int AS trade_count,
        ROUND(AVG(ABS(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 60))::numeric, 1) AS avg_hold_minutes,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ABS(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 60))::numeric, 1) AS median_hold_minutes
      FROM trades t
      ${this.getOptOutFilter()}
      WHERE t.pnl IS NOT NULL AND t.pnl != 0
        AND t.entry_time IS NOT NULL AND t.exit_time IS NOT NULL
        ${dateFilter.clause}
        ${instFilter.clause}
      GROUP BY CASE WHEN t.pnl > 0 THEN 'winner' ELSE 'loser' END
    `;

    const result = await db.query(query, [...dateFilter.params, ...instFilter.params]);
    const mapped = {};
    for (const row of result.rows) {
      mapped[row.outcome] = row;
    }
    return mapped;
  }

  /**
   * Consecutive loss analysis: after N consecutive losses, what happens on the next trade?
   */
  static async getConsecutiveLossAnalysis(period = 'all', options = {}) {
    const dateFilter = this.getDateFilter(period);
    const instFilter = this.getInstrumentTypeFilter(options.instrumentTypes, dateFilter.nextIndex);
    const { minUsers } = this.getThresholds(options);

    const query = `
      WITH ordered_trades AS (
        SELECT
          t.user_id,
          t.pnl,
          t.entry_time,
          ROW_NUMBER() OVER (PARTITION BY t.user_id ORDER BY t.entry_time) AS rn,
          CASE WHEN t.pnl < 0 THEN 1 ELSE 0 END AS is_loss
        FROM trades t
        ${this.getOptOutFilter()}
        WHERE t.pnl IS NOT NULL AND t.entry_time IS NOT NULL
          ${dateFilter.clause}
          ${instFilter.clause}
      ),
      loss_streaks AS (
        SELECT
          user_id, pnl, entry_time, rn, is_loss,
          rn - SUM(is_loss) OVER (PARTITION BY user_id ORDER BY rn) AS grp
        FROM ordered_trades
      ),
      streak_lengths AS (
        SELECT
          user_id, rn, pnl,
          CASE WHEN is_loss = 1
            THEN COUNT(*) OVER (PARTITION BY user_id, grp ORDER BY rn ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            ELSE 0
          END AS consecutive_losses
        FROM loss_streaks
      ),
      next_trade AS (
        SELECT
          sl.user_id,
          sl.consecutive_losses,
          LEAD(sl.pnl) OVER (PARTITION BY sl.user_id ORDER BY sl.rn) AS next_pnl
        FROM streak_lengths sl
        WHERE sl.consecutive_losses >= 2
      )
      SELECT
        consecutive_losses AS streak_length,
        COUNT(*)::int AS occurrences,
        COUNT(DISTINCT user_id)::int AS user_count,
        ROUND(AVG(next_pnl)::numeric, 2) AS avg_next_trade_pnl,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE next_pnl > 0) / NULLIF(COUNT(*) FILTER (WHERE next_pnl IS NOT NULL), 0),
          1
        ) AS next_trade_win_rate
      FROM next_trade
      WHERE next_pnl IS NOT NULL
      GROUP BY consecutive_losses
      HAVING COUNT(DISTINCT user_id) >= ${minUsers}
      ORDER BY consecutive_losses
    `;

    const result = await db.query(query, [...dateFilter.params, ...instFilter.params]);
    return result.rows;
  }

  /**
   * Sentiment analysis: net long/short bias per symbol
   */
  static async getSentimentAnalysis(period = 'all', limit = 20, options = {}) {
    const dateFilter = this.getDateFilter(period);
    const instFilter = this.getInstrumentTypeFilter(options.instrumentTypes, dateFilter.nextIndex);
    const { minTrades, minUsers } = this.getThresholds(options);

    const query = `
      SELECT
        t.symbol,
        COUNT(*) FILTER (WHERE LOWER(t.side) IN ('long', 'buy'))::int AS long_count,
        COUNT(*) FILTER (WHERE LOWER(t.side) IN ('short', 'sell'))::int AS short_count,
        COUNT(*)::int AS total_count,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE LOWER(t.side) IN ('long', 'buy')) / NULLIF(COUNT(*), 0),
          1
        ) AS long_percent,
        COUNT(DISTINCT t.user_id)::int AS user_count
      FROM trades t
      ${this.getOptOutFilter()}
      WHERE t.pnl IS NOT NULL AND t.side IS NOT NULL
        ${dateFilter.clause}
        ${instFilter.clause}
      GROUP BY t.symbol
      HAVING COUNT(*) >= ${minTrades} AND COUNT(DISTINCT t.user_id) >= ${minUsers}
      ORDER BY total_count DESC
      LIMIT $${instFilter.nextIndex}
    `;

    const result = await db.query(query, [...dateFilter.params, ...instFilter.params, limit]);
    return result.rows;
  }

  /**
   * Most traded today: top 10 symbols by trade count today
   */
  static async getMostTradedToday(options = {}) {
    const instFilter = this.getInstrumentTypeFilter(options.instrumentTypes);
    const { minUsers } = this.getThresholds(options);

    const query = `
      SELECT
        t.symbol,
        COUNT(*)::int AS trade_count,
        COUNT(DISTINCT t.user_id)::int AS user_count,
        ROUND(AVG(t.pnl)::numeric, 2) AS avg_pnl,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE t.pnl > 0) / NULLIF(COUNT(*), 0),
          1
        ) AS win_rate
      FROM trades t
      ${this.getOptOutFilter()}
      WHERE t.pnl IS NOT NULL
        AND t.entry_time >= CURRENT_DATE
        ${instFilter.clause}
      GROUP BY t.symbol
      HAVING COUNT(DISTINCT t.user_id) >= ${minUsers}
      ORDER BY trade_count DESC
      LIMIT 10
    `;

    const result = await db.query(query, instFilter.params);
    return result.rows;
  }

  /**
   * Revenge trading cost: focused stats on revenge trading financial impact
   */
  static async getRevengeTradingCost(period = 'all', options = {}) {
    const dateFilter = this.getDateFilter(period, 1, 'rte.trigger_timestamp');
    const { minUsers } = this.getThresholds(options);

    // revenge_trading_events doesn't have instrument_type, no filter applied
    const query = `
      SELECT
        COUNT(*)::int AS total_events,
        COUNT(DISTINCT rte.user_id)::int AS affected_users,
        ROUND(AVG(rte.total_additional_loss)::numeric, 2) AS avg_additional_loss,
        ROUND(SUM(rte.total_additional_loss)::numeric, 2) AS total_loss,
        ROUND(AVG(rte.position_size_increase_percent)::numeric, 1) AS avg_position_size_increase,
        ROUND(AVG(rte.total_revenge_trades)::numeric, 1) AS avg_revenge_trades
      FROM revenge_trading_events rte
      JOIN user_settings us_optout ON us_optout.user_id = rte.user_id AND (us_optout.contribute_anonymous_data IS NULL OR us_optout.contribute_anonymous_data = true)
      WHERE 1=1
        ${dateFilter.clause}
      HAVING COUNT(DISTINCT rte.user_id) >= ${minUsers}
    `;

    const result = await db.query(query, dateFilter.params);
    return result.rows[0] || null;
  }

  // ========== Phase 3: Percentile Ranking ==========

  /**
   * Get a user's percentile rankings compared to the community
   */
  static async getUserPercentiles(userId, options = {}) {
    const instFilter = this.getInstrumentTypeFilter(options.instrumentTypes, 2);

    // Query 1: This user's metrics
    const userQuery = `
      SELECT
        ROUND(100.0 * COUNT(*) FILTER (WHERE t.pnl > 0) / NULLIF(COUNT(*) FILTER (WHERE t.pnl IS NOT NULL), 0), 1) AS win_rate,
        ROUND(AVG(t.pnl)::numeric, 2) AS avg_pnl,
        ROUND(AVG(ABS(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 60)) FILTER (WHERE t.pnl > 0)::numeric, 1) AS avg_winner_hold,
        ROUND(AVG(ABS(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 60)) FILTER (WHERE t.pnl < 0)::numeric, 1) AS avg_loser_hold,
        COUNT(*)::int AS total_trades
      FROM trades t
      WHERE t.user_id = $1 AND t.pnl IS NOT NULL
        ${instFilter.clause}
    `;

    // Query 2: All opted-in users' metrics (grouped by user)
    const allUsersInstFilter = this.getInstrumentTypeFilter(options.instrumentTypes);
    const allUsersQuery = `
      SELECT
        t.user_id,
        ROUND(100.0 * COUNT(*) FILTER (WHERE t.pnl > 0) / NULLIF(COUNT(*) FILTER (WHERE t.pnl IS NOT NULL), 0), 1) AS win_rate,
        ROUND(AVG(t.pnl)::numeric, 2) AS avg_pnl,
        ROUND(AVG(ABS(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 60)) FILTER (WHERE t.pnl > 0)::numeric, 1) AS avg_winner_hold,
        ROUND(AVG(ABS(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 60)) FILTER (WHERE t.pnl < 0)::numeric, 1) AS avg_loser_hold
      FROM trades t
      ${this.getOptOutFilter()}
      WHERE t.pnl IS NOT NULL
        ${allUsersInstFilter.clause}
      GROUP BY t.user_id
      HAVING COUNT(*) >= 10
    `;

    const [userResult, allUsersResult] = await Promise.all([
      db.query(userQuery, [userId, ...instFilter.params]),
      db.query(allUsersQuery, allUsersInstFilter.params)
    ]);

    const userMetrics = userResult.rows[0];
    if (!userMetrics || userMetrics.total_trades < 10) {
      return null; // Not enough trades
    }

    const allUsers = allUsersResult.rows;
    if (allUsers.length < MIN_USERS) {
      return null; // Not enough community data
    }

    function computePercentile(userValue, allValues) {
      if (userValue == null || allValues.length === 0) return null;
      const below = allValues.filter(v => v != null && v < userValue).length;
      return Math.round((below / allValues.length) * 100);
    }

    function computeAverage(allValues) {
      const valid = allValues.filter(v => v != null);
      if (valid.length === 0) return null;
      return Math.round((valid.reduce((sum, v) => sum + v, 0) / valid.length) * 100) / 100;
    }

    const winRates = allUsers.map(u => parseFloat(u.win_rate));
    const avgPnls = allUsers.map(u => parseFloat(u.avg_pnl));
    const winnerHolds = allUsers.map(u => parseFloat(u.avg_winner_hold));
    const loserHolds = allUsers.map(u => parseFloat(u.avg_loser_hold));

    const metrics = [
      {
        metric: 'win_rate',
        label: 'Win Rate',
        user_value: parseFloat(userMetrics.win_rate),
        global_average: computeAverage(winRates),
        percentile: computePercentile(parseFloat(userMetrics.win_rate), winRates),
        unit: '%'
      },
      {
        metric: 'avg_pnl',
        label: 'Avg P&L per Trade',
        user_value: parseFloat(userMetrics.avg_pnl),
        global_average: computeAverage(avgPnls),
        percentile: computePercentile(parseFloat(userMetrics.avg_pnl), avgPnls),
        unit: '$'
      },
      {
        metric: 'avg_winner_hold',
        label: 'Avg Winner Hold Time',
        user_value: parseFloat(userMetrics.avg_winner_hold),
        global_average: computeAverage(winnerHolds),
        percentile: computePercentile(parseFloat(userMetrics.avg_winner_hold), winnerHolds),
        unit: 'min'
      },
      {
        metric: 'avg_loser_hold',
        label: 'Avg Loser Hold Time',
        user_value: parseFloat(userMetrics.avg_loser_hold),
        global_average: computeAverage(loserHolds),
        // For loser hold, lower is better, so invert percentile
        percentile: 100 - computePercentile(parseFloat(userMetrics.avg_loser_hold), loserHolds),
        unit: 'min'
      }
    ];

    return {
      metrics,
      total_community_traders: allUsers.length
    };
  }

  // ========== Phase 4: Public Pulse ==========

  /**
   * Get curated public pulse data (no auth required)
   */
  static async getPublicPulse() {
    // Check we have enough users for privacy
    const userCountResult = await db.query('SELECT COUNT(DISTINCT user_id)::int AS cnt FROM trades WHERE pnl IS NOT NULL');
    const totalUsers = userCountResult.rows[0]?.cnt || 0;
    if (totalUsers < MIN_USERS) {
      return null;
    }

    const [holdTime, mostTraded, overview] = await Promise.all([
      this.getHoldTimeComparison('30d'),
      this.getMostTradedToday(),
      this.getOverviewStats('30d')
    ]);

    return {
      hold_time: holdTime,
      most_traded_today: mostTraded.slice(0, 5),
      overview: {
        total_trades: overview.total_trades,
        overall_win_rate: overview.overall_win_rate,
        avg_hold_time_minutes: overview.avg_hold_time_minutes
      },
      trades_today: mostTraded.reduce((sum, s) => sum + s.trade_count, 0)
    };
  }

  // ========== Aggregation Methods ==========

  /**
   * Get all aggregate data at once (for admin view)
   */
  static async getAll(period = 'all', options = {}) {
    const adminOptions = { ...options, isAdmin: true };
    const [overview, symbols, time_analysis, strategies, behavioral, hold_time, consecutive_loss, sentiment, most_traded_today, revenge_cost, available_instrument_types] = await Promise.all([
      this.getOverviewStats(period, adminOptions),
      this.getSymbolPerformance(period, 100, adminOptions),
      this.getTimeOfDayAnalysis(period, adminOptions),
      this.getStrategyAnalysis(period, 100, adminOptions),
      this.getBehavioralPatterns(period, adminOptions),
      this.getHoldTimeComparison(period, adminOptions),
      this.getConsecutiveLossAnalysis(period, adminOptions),
      this.getSentimentAnalysis(period, 50, adminOptions),
      this.getMostTradedToday(adminOptions),
      this.getRevengeTradingCost(period, adminOptions),
      this.getAvailableInstrumentTypes(period)
    ]);

    return { overview, symbols, time_analysis, strategies, behavioral, hold_time, consecutive_loss, sentiment, most_traded_today, revenge_cost, available_instrument_types };
  }

  /**
   * Curated subset for Pro users (no user counts, limited rows)
   */
  static async getCommunityInsights(period = 'all', options = {}) {
    const [overview, symbols, time_analysis, strategies, behavioral, hold_time, consecutive_loss, sentiment, most_traded_today, revenge_cost, available_instrument_types] = await Promise.all([
      this.getOverviewStats(period, options),
      this.getSymbolPerformance(period, 10, options),
      this.getTimeOfDayAnalysis(period, options),
      this.getStrategyAnalysis(period, 10, options),
      this.getBehavioralPatterns(period, options),
      this.getHoldTimeComparison(period, options),
      this.getConsecutiveLossAnalysis(period, options),
      this.getSentimentAnalysis(period, 20, options),
      this.getMostTradedToday(options),
      this.getRevengeTradingCost(period, options),
      this.getAvailableInstrumentTypes(period)
    ]);

    // Strip user counts for privacy
    const stripUserCounts = (rows) => rows.map(({ user_count, ...rest }) => rest);

    return {
      overview: {
        total_trades: overview.total_trades,
        symbols_traded: overview.symbols_traded,
        overall_win_rate: overview.overall_win_rate,
        avg_pnl_per_trade: overview.avg_pnl_per_trade,
        avg_hold_time_minutes: overview.avg_hold_time_minutes
      },
      symbols: stripUserCounts(symbols),
      time_analysis: {
        hourly: stripUserCounts(time_analysis.hourly),
        day_of_week: stripUserCounts(time_analysis.day_of_week)
      },
      strategies: stripUserCounts(strategies),
      behavioral: {
        patterns: behavioral.patterns.map(({ affected_users, ...rest }) => rest),
        revenge_trading: behavioral.revenge_trading ? (() => {
          const { affected_users, ...rest } = behavioral.revenge_trading;
          return rest;
        })() : null
      },
      hold_time,
      consecutive_loss: consecutive_loss.map(({ user_count, ...rest }) => rest),
      sentiment: stripUserCounts(sentiment),
      most_traded_today: stripUserCounts(most_traded_today),
      revenge_cost: revenge_cost ? (() => {
        const { affected_users, ...rest } = revenge_cost;
        return rest;
      })() : null,
      available_instrument_types: available_instrument_types.map(({ instrument_type, trade_count }) => ({ instrument_type, trade_count }))
    };
  }
}

module.exports = AggregateAnalytics;
