// TradeQueries — single seam for filtering trade data.
//
// Owns the WHERE-clause + parameter construction for trade list and analytics
// queries. Replaces what used to be duplicated across Trade.findByUser and
// Trade.getAnalytics, where the two paths had silently drifted (e.g., broker
// filter applied twice in analytics, missing CUSIP fallback, sector emitted
// as LEFT JOIN vs EXISTS).
//
// Anything that needs to query trades by user filters should go through this
// module. Adding a new filter is a one-place edit in `_buildWhereClause`.

const db = require('../config/database');
const Trade = require('../models/Trade');
const { getUserTimezone } = require('../utils/timezone');

async function timedDbQuery(label, query, values = []) {
  const startedAt = Date.now();
  try {
    const result = await db.query(query, values);
    console.log(`[PERF] ${label} took ${Date.now() - startedAt}ms (${result.rowCount ?? result.rows?.length ?? 0} rows)`);
    return result;
  } catch (error) {
    console.warn(`[PERF] ${label} failed after ${Date.now() - startedAt}ms: ${error.message}`);
    throw error;
  }
}

class TradeQueries {
  // Internal: builds the WHERE clause and parameter array for a filter spec.
  // Returns { whereClause, values, paramCount, needsSectorOuterJoin }.
  //   - needsSectorOuterJoin: hint for callers that select sector data — they
  //     must add a LEFT JOIN symbol_categories sc in the outer query.
  //     The WHERE clause itself uses EXISTS subqueries for sector filtering,
  //     so this flag is purely about the SELECT list.
  //
  // Sample trades (tag 'sample', seeded by SampleDataService for new users on
  // billing-enabled instances) are treated as normal trades by this builder.
  // Users remove them via the "Remove sample data" action or by deleting them
  // individually like any other trade.
  static async _buildWhereClause(userId, filters = {}) {
    const values = [userId];
    let paramCount = 2;
    let whereClause = `WHERE t.user_id = $1`;
    let needsSectorOuterJoin = false;

    if (filters.symbol) {
      if (filters.symbolExact) {
        whereClause += ` AND (
          UPPER(t.symbol) = $${paramCount} OR
          t.symbol IN (
            SELECT cm.cusip FROM cusip_mappings cm
            WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
              AND UPPER(cm.ticker) = $${paramCount}
          )
        )`;
      } else {
        whereClause += ` AND (
          t.symbol ILIKE $${paramCount} || '%' OR
          t.symbol IN (
            SELECT DISTINCT
              CASE
                WHEN cm.ticker ILIKE $${paramCount} || '%' THEN cm.cusip
                WHEN cm.cusip = t.symbol AND cm.ticker ILIKE $${paramCount} || '%' THEN cm.cusip
                ELSE NULL
              END
            FROM cusip_mappings cm
            WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
              AND (
                (cm.cusip = t.symbol AND cm.ticker ILIKE $${paramCount} || '%') OR
                (cm.ticker ILIKE $${paramCount} || '%')
              )
          )
        )`;
      }
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }

    if (filters.startDate && filters.endDate) {
      whereClause += ` AND ((t.trade_date >= $${paramCount} AND t.trade_date <= $${paramCount + 1}) OR (t.exit_time::date >= $${paramCount} AND t.exit_time::date <= $${paramCount + 1}))`;
      values.push(filters.startDate, filters.endDate);
      paramCount += 2;
    } else if (filters.startDate) {
      whereClause += ` AND (t.trade_date >= $${paramCount} OR t.exit_time::date >= $${paramCount})`;
      values.push(filters.startDate);
      paramCount++;
    } else if (filters.endDate) {
      whereClause += ` AND (t.trade_date <= $${paramCount} OR t.exit_time::date <= $${paramCount})`;
      values.push(filters.endDate);
      paramCount++;
    }

    if (filters.exitStartDate) {
      whereClause += ` AND t.exit_time::date >= $${paramCount}`;
      values.push(filters.exitStartDate);
      paramCount++;
    }

    if (filters.exitEndDate) {
      whereClause += ` AND t.exit_time::date <= $${paramCount}`;
      values.push(filters.exitEndDate);
      paramCount++;
    }

    if (filters.importId) {
      whereClause += ` AND t.import_id = $${paramCount}`;
      values.push(filters.importId);
      paramCount++;
    }

    if (filters.tags && filters.tags.length > 0) {
      whereClause += ` AND t.tags && $${paramCount}`;
      values.push(filters.tags);
      paramCount++;
    }

    if (filters.strategies && filters.strategies.length > 0) {
      const placeholders = filters.strategies.map((_, i) => `$${paramCount + i}`).join(',');
      whereClause += ` AND t.strategy IN (${placeholders})`;
      filters.strategies.forEach(s => values.push(s));
      paramCount += filters.strategies.length;
    }

    if (filters.setups && filters.setups.length > 0) {
      const placeholders = filters.setups.map((_, i) => `$${paramCount + i}`).join(',');
      whereClause += ` AND t.setup IN (${placeholders})`;
      filters.setups.forEach(s => values.push(s));
      paramCount += filters.setups.length;
    }

    if (filters.sectors && filters.sectors.length > 0) {
      needsSectorOuterJoin = true;
      const placeholders = filters.sectors.map((_, i) => `$${paramCount + i}`).join(',');
      whereClause += ` AND EXISTS (SELECT 1 FROM symbol_categories sc WHERE sc.symbol = t.symbol AND sc.finnhub_industry IN (${placeholders}))`;
      filters.sectors.forEach(s => values.push(s));
      paramCount += filters.sectors.length;
    }

    if (filters.sector) {
      needsSectorOuterJoin = true;
      whereClause += ` AND EXISTS (SELECT 1 FROM symbol_categories sc WHERE sc.symbol = t.symbol AND sc.finnhub_industry = $${paramCount})`;
      values.push(filters.sector);
      paramCount++;
    }

    if (filters.hasNews !== undefined && filters.hasNews !== '' && filters.hasNews !== null) {
      if (filters.hasNews === 'true' || filters.hasNews === true || filters.hasNews === 1 || filters.hasNews === '1') {
        whereClause += ` AND t.has_news = true`;
      } else if (filters.hasNews === 'false' || filters.hasNews === false || filters.hasNews === 0 || filters.hasNews === '0') {
        whereClause += ` AND (t.has_news = false OR t.has_news IS NULL)`;
      }
    }

    if (filters.side) {
      whereClause += ` AND t.side = $${paramCount}`;
      values.push(filters.side);
      paramCount++;
    }

    if (filters.minPrice !== undefined && filters.minPrice !== null && filters.minPrice !== '') {
      whereClause += ` AND t.entry_price >= $${paramCount}`;
      values.push(filters.minPrice);
      paramCount++;
    }

    if (filters.maxPrice !== undefined && filters.maxPrice !== null && filters.maxPrice !== '') {
      whereClause += ` AND t.entry_price <= $${paramCount}`;
      values.push(filters.maxPrice);
      paramCount++;
    }

    if (filters.minQuantity !== undefined && filters.minQuantity !== null && filters.minQuantity !== '') {
      whereClause += ` AND t.quantity >= $${paramCount}`;
      values.push(filters.minQuantity);
      paramCount++;
    }

    if (filters.maxQuantity !== undefined && filters.maxQuantity !== null && filters.maxQuantity !== '') {
      whereClause += ` AND t.quantity <= $${paramCount}`;
      values.push(filters.maxQuantity);
      paramCount++;
    }

    if (filters.status === 'pending') {
      whereClause += ` AND t.entry_price IS NULL`;
    } else if (filters.status === 'open') {
      whereClause += ` AND t.entry_price IS NOT NULL AND t.exit_price IS NULL`;
    } else if (filters.status === 'closed') {
      whereClause += ` AND t.exit_price IS NOT NULL`;
    }

    if (filters.minPnl !== undefined && filters.minPnl !== null && filters.minPnl !== '') {
      whereClause += ` AND t.pnl >= $${paramCount}`;
      values.push(filters.minPnl);
      paramCount++;
    }

    if (filters.maxPnl !== undefined && filters.maxPnl !== null && filters.maxPnl !== '') {
      whereClause += ` AND t.pnl <= $${paramCount}`;
      values.push(filters.maxPnl);
      paramCount++;
    }

    // Breakeven is judged on GROSS P&L (price only), so a trade scratched at
    // entry isn't miscounted as a loss purely because of commissions/fees. The
    // per-user tolerance (in ticks) widens "breakeven" to gross P&L within
    // +/- N ticks, scaled per-instrument. Wins/losses are decided by NET P&L
    // among the non-breakeven trades.
    if (filters.pnlType) {
      const { getBreakevenToleranceConfig, breakevenPredicate } = require('../utils/breakeven');
      const config = filters.breakevenToleranceConfig !== undefined
        ? filters.breakevenToleranceConfig
        : await getBreakevenToleranceConfig(userId);
      const be = breakevenPredicate({
        gross: '(t.pnl + COALESCE(t.commission, 0) + COALESCE(t.fees, 0))',
        tickSize: 't.tick_size',
        pointValue: 't.point_value',
        quantity: 't.quantity',
        underlying: 't.underlying_asset'
      }, config);
      if (filters.pnlType === 'profit' || filters.pnlType === 'positive') {
        whereClause += ` AND ${be.isNot} AND t.pnl > 0`;
      } else if (filters.pnlType === 'loss' || filters.pnlType === 'negative') {
        whereClause += ` AND ${be.isNot} AND t.pnl < 0`;
      } else if (filters.pnlType === 'breakeven') {
        whereClause += ` AND ${be.is}`;
      }
    }

    if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
      const userTimezone = await getUserTimezone(userId);
      const placeholders = filters.daysOfWeek.map((_, i) => `$${paramCount + i}`).join(',');
      whereClause += ` AND extract(dow from (t.entry_time AT TIME ZONE $${paramCount + filters.daysOfWeek.length})) IN (${placeholders})`;
      filters.daysOfWeek.forEach(d => values.push(d));
      values.push(userTimezone);
      paramCount += filters.daysOfWeek.length + 1;
    }

    if (filters.instrumentTypes && filters.instrumentTypes.length > 0) {
      const placeholders = filters.instrumentTypes.map((_, i) => `$${paramCount + i}`).join(',');
      whereClause += ` AND t.instrument_type IN (${placeholders})`;
      filters.instrumentTypes.forEach(t => values.push(t));
      paramCount += filters.instrumentTypes.length;
    }

    if (filters.optionTypes && filters.optionTypes.length > 0) {
      const placeholders = filters.optionTypes.map((_, i) => `$${paramCount + i}`).join(',');
      whereClause += ` AND t.option_type IN (${placeholders})`;
      filters.optionTypes.forEach(t => values.push(t));
      paramCount += filters.optionTypes.length;
    }

    // Broker filter — applied ONCE. Old code in getAnalytics applied it twice
    // due to two near-duplicate blocks; that's the intentional drift fix.
    if (filters.brokers) {
      const brokerList = String(filters.brokers).split(',').map(b => b.trim()).filter(Boolean);
      if (brokerList.length > 0) {
        whereClause += ` AND t.broker = ANY($${paramCount}::text[])`;
        values.push(brokerList);
        paramCount++;
      }
    } else if (filters.broker) {
      whereClause += ` AND t.broker = $${paramCount}`;
      values.push(filters.broker);
      paramCount++;
    }

    if (filters.accounts && filters.accounts.length > 0) {
      if (filters.accounts.includes('__unsorted__')) {
        whereClause += ` AND (t.account_identifier IS NULL OR t.account_identifier = '')`;
      } else {
        const placeholders = filters.accounts.map((_, i) => `$${paramCount + i}`).join(',');
        whereClause += ` AND t.account_identifier IN (${placeholders})`;
        filters.accounts.forEach(a => values.push(a));
        paramCount += filters.accounts.length;
      }
    }

    if (filters.qualityGrades && filters.qualityGrades.length > 0) {
      const placeholders = filters.qualityGrades.map((_, i) => `$${paramCount + i}`).join(',');
      whereClause += ` AND t.quality_grade IN (${placeholders})`;
      filters.qualityGrades.forEach(g => values.push(g));
      paramCount += filters.qualityGrades.length;
    }

    if (filters.holdTime) {
      whereClause += Trade.getHoldTimeFilter(filters.holdTime);
    }

    if (filters.hasRValue !== undefined && filters.hasRValue !== '' && filters.hasRValue !== null) {
      if (filters.hasRValue === 'true' || filters.hasRValue === true || filters.hasRValue === '1') {
        whereClause += ` AND t.stop_loss IS NOT NULL`;
      }
    }

    // Strategy single-value filter uses the time-range mapping from
    // Trade.getStrategyFilter (e.g., 'scalper' → < 15 min hold). This was
    // previously only applied in findByUser; getAnalytics did plain equality.
    // Unified to time-range mapping; for tag-based equality, callers should
    // pass `strategies: [name]` instead.
    if (filters.strategy && (!filters.strategies || filters.strategies.length === 0)) {
      whereClause += Trade.getStrategyFilter(filters.strategy);
    }

    return { whereClause, values, paramCount, needsSectorOuterJoin };
  }

  // Find trades for a user matching the given filters.
  static async findByUser(userId, filters = {}) {
    const startTime = Date.now();
    console.log('[PERF] findByUser started for user:', userId);

    const { whereClause, values, paramCount: pcAfterWhere, needsSectorOuterJoin } =
      await this._buildWhereClause(userId, filters);

    let paramCount = pcAfterWhere;
    let subquery = `SELECT t.id FROM trades t`;
    if (needsSectorOuterJoin) {
      subquery += ` LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol`;
    }
    subquery += ` ${whereClause} ORDER BY t.trade_date DESC, t.entry_time DESC`;

    if (filters.limit) {
      subquery += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
      paramCount++;
    }
    if (filters.offset) {
      subquery += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
      paramCount++;
    }

    const mainQuery = `
      SELECT t.*,
        t.strategy, t.setup,
        pm.current_price,
        array_agg(DISTINCT ta.file_url) FILTER (WHERE ta.id IS NOT NULL) as attachment_urls,
        (SELECT array_agg(tch.chart_url ORDER BY tch.uploaded_at ASC) FROM trade_charts tch WHERE tch.trade_id = t.id) as chart_urls,
        count(DISTINCT tc.id)::integer as comment_count,
        sc.finnhub_industry as sector,
        sc.company_name as company_name,
        tpg.detected_strategy as group_detected_strategy,
        tpg.leg_count as group_leg_count
      FROM (${subquery}) AS trade_ids
      INNER JOIN trades t ON t.id = trade_ids.id
      LEFT JOIN price_monitoring pm ON pm.symbol = t.symbol
      LEFT JOIN trade_attachments ta ON t.id = ta.trade_id
      LEFT JOIN trade_comments tc ON t.id = tc.trade_id
      LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
      LEFT JOIN trade_position_groups tpg ON t.position_group_id = tpg.id
      GROUP BY t.id, pm.current_price, sc.finnhub_industry, sc.company_name, tpg.detected_strategy, tpg.leg_count
      ORDER BY t.trade_date DESC, t.entry_time DESC
    `;

    const queryStartTime = Date.now();
    const result = await db.query(mainQuery, values);
    const queryEndTime = Date.now();
    console.log('[PERF] findByUser query took:', queryEndTime - queryStartTime, 'ms, returned', result.rows.length, 'rows');
    console.log('[PERF] findByUser total time:', queryEndTime - startTime, 'ms');
    return result.rows;
  }

  // Aggregate analytics for a user matching the given filters.
  // Fans out to 7 parallel queries that all share the same WHERE clause.
  static async getAnalytics(userId, filters = {}) {
    const analyticsStartedAt = Date.now();
    console.log('Getting analytics for user:', userId, 'with filters:', filters);

    const User = require('../models/User');
    const { normalizeConfig, breakevenPredicate } = require('../utils/breakeven');
    const { POSITION_GROUP_KEY, GROUPED_BREAKEVEN } = require('../utils/positionGrouping');
    let useMedian = false;
    let breakevenConfig = { default: 0, byUnderlying: {} };
    // Whole-trade win rate (issue #339): when the profile setting is on, the
    // completed_trades CTE collapses multi-leg positions opened together into a
    // single trade so the headline win rate / counts / profit factor are
    // measured per position. Total P&L is unchanged.
    let groupByPosition = false;
    try {
      const userSettings = await User.getSettings(userId);
      useMedian = userSettings?.statistics_calculation === 'median';
      groupByPosition = userSettings?.analytics_position_grouping === true;
      breakevenConfig = normalizeConfig({
        default: userSettings?.breakeven_tolerance_ticks,
        byUnderlying: userSettings?.breakeven_tolerance_ticks_by_underlying
      });
    } catch (error) {
      console.warn('Could not fetch user settings for analytics, using default (average):', error.message);
    }

    // Pass the config we just fetched into the WHERE builder so it doesn't
    // re-query user settings for the pnlType filter.
    const { whereClause, values } = await this._buildWhereClause(userId, {
      ...filters,
      breakevenToleranceConfig: breakevenConfig
    });

    // Breakeven predicates: one over the completed_trades CTE aliases
    // (trade_pnl / trade_costs), one over the raw columns used by the daily query.
    // In position-grouping mode the per-leg tick tolerance no longer applies to a
    // combined position, so a grouped trade is breakeven only when its net P&L
    // (trade_pnl) rounds to zero.
    const beCte = groupByPosition
      ? { is: '(ROUND(trade_pnl::numeric, 2) = 0)', isNot: '(ROUND(trade_pnl::numeric, 2) <> 0)' }
      : breakevenPredicate({
          gross: '(trade_pnl + trade_costs)',
          tickSize: 'tick_size',
          pointValue: 'point_value',
          quantity: 'quantity',
          underlying: 'underlying_asset'
        }, breakevenConfig);
    const beDaily = breakevenPredicate({
      gross: '(COALESCE(pnl, 0) + COALESCE(commission, 0) + COALESCE(fees, 0))',
      tickSize: 'tick_size',
      pointValue: 'point_value',
      quantity: 'quantity',
      underlying: 'underlying_asset'
    }, breakevenConfig);

    const executionCountQuery = `
      SELECT COUNT(*) as execution_count
      FROM trades t
      ${whereClause}
    `;

    // Per-leg vs per-position completed_trades. The grouped form sums legs that
    // share account + underlying/symbol + entry_time into one synthetic trade.
    // Only columns referenced downstream are projected; the grouped beCte above
    // works on trade_pnl, so tick_size/point_value/quantity/underlying_asset are
    // not needed in grouped mode.
    const completedTradesCte = groupByPosition
      ? `completed_trades AS (
        SELECT
          MIN(symbol) as symbol,
          MIN(id::text) as trade_group,
          SUM(pnl) as trade_pnl,
          SUM(COALESCE(commission, 0) + COALESCE(fees, 0)) as trade_costs,
          COUNT(*) as execution_count,
          AVG(pnl_percent) as avg_return_pct,
          MIN(trade_date) as first_trade_date,
          MIN(entry_time) as first_entry,
          MAX(COALESCE(exit_time, entry_time)) as last_exit,
          SUM(r_value) as r_value
        FROM trades t
        ${whereClause}
          AND exit_price IS NOT NULL
          AND pnl IS NOT NULL
        GROUP BY ${POSITION_GROUP_KEY}
      )`
      : `completed_trades AS (
        SELECT
          symbol,
          id as trade_group,
          pnl as trade_pnl,
          (COALESCE(commission, 0) + COALESCE(fees, 0)) as trade_costs,
          tick_size,
          point_value,
          quantity,
          underlying_asset,
          1 as execution_count,
          pnl_percent as avg_return_pct,
          trade_date as first_trade_date,
          entry_time as first_entry,
          COALESCE(exit_time, entry_time) as last_exit,
          r_value
        FROM trades t
        ${whereClause}
          AND exit_price IS NOT NULL
          AND pnl IS NOT NULL
      )`;

    const analyticsQuery = `
      WITH ${completedTradesCte},
      trade_stats AS (
        SELECT
          COUNT(*)::integer as total_trades,
          -- Breakeven = gross P&L within tolerance (exited ~at entry, ignoring
          -- commissions/fees). Wins/losses use NET P&L among the rest.
          COUNT(CASE WHEN ${beCte.isNot} AND trade_pnl > 0 THEN 1 END)::integer as winning_trades,
          COUNT(CASE WHEN ${beCte.isNot} AND trade_pnl < 0 THEN 1 END)::integer as losing_trades,
          COUNT(CASE WHEN ${beCte.is} THEN 1 END)::integer as breakeven_trades,
          SUM(trade_pnl) as total_pnl,
          SUM(trade_costs) as total_costs,
          ${useMedian
            ? `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trade_pnl) as avg_pnl,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trade_pnl) FILTER (WHERE ${beCte.isNot} AND trade_pnl > 0) as avg_win,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trade_pnl) FILTER (WHERE ${beCte.isNot} AND trade_pnl < 0) as avg_loss,`
            : `AVG(trade_pnl) as avg_pnl,
               AVG(CASE WHEN ${beCte.isNot} AND trade_pnl > 0 THEN trade_pnl END) as avg_win,
               AVG(CASE WHEN ${beCte.isNot} AND trade_pnl < 0 THEN trade_pnl END) as avg_loss,`}
          MAX(trade_pnl) as best_trade,
          MIN(trade_pnl) as worst_trade,
          COUNT(DISTINCT symbol) as symbols_traded,
          COUNT(DISTINCT first_trade_date) as trading_days,
          AVG(avg_return_pct) as avg_return_pct,
          AVG(r_value) as avg_r_value,
          SUM(r_value) as total_r_value,
          STDDEV(trade_pnl) as pnl_stddev,
          SUM(CASE WHEN trade_pnl > 0 THEN trade_pnl ELSE 0 END) as total_gross_wins,
          SUM(CASE WHEN trade_pnl < 0 THEN trade_pnl ELSE 0 END) as total_gross_losses
        FROM completed_trades
      ),
      daily_pnl AS (
        SELECT first_trade_date as trade_date, SUM(trade_pnl) as daily_pnl
        FROM completed_trades
        GROUP BY first_trade_date
      ),
      cumulative_daily_pnl AS (
        SELECT
          trade_date,
          daily_pnl,
          SUM(daily_pnl) OVER (ORDER BY trade_date) as cumulative_pnl
        FROM daily_pnl
      ),
      drawdown_calc AS (
        SELECT
          trade_date,
          daily_pnl,
          cumulative_pnl,
          MAX(cumulative_pnl) OVER (ORDER BY trade_date) as running_max,
          cumulative_pnl - MAX(cumulative_pnl) OVER (ORDER BY trade_date) as drawdown
        FROM cumulative_daily_pnl
      ),
      drawdown_debug AS (
        SELECT MIN(drawdown) as min_drawdown FROM drawdown_calc
      ),
      individual_trades AS (
        SELECT
          trade_pnl,
          ROW_NUMBER() OVER (ORDER BY trade_pnl DESC) as best_rank,
          ROW_NUMBER() OVER (ORDER BY trade_pnl ASC) as worst_rank
        FROM completed_trades
      )
      SELECT
        ts.total_trades,
        ts.winning_trades,
        ts.losing_trades,
        ts.breakeven_trades,
        ts.total_pnl,
        ts.total_costs,
        ts.avg_pnl,
        ts.avg_win,
        ts.avg_loss,
        ts.best_trade,
        ts.worst_trade,
        ts.symbols_traded,
        ts.trading_days,
        ts.avg_return_pct,
        ts.avg_r_value,
        ts.total_r_value,
        ts.pnl_stddev,
        dp.max_daily_gain,
        dp.max_daily_loss,
        COALESCE(dd.max_drawdown, 0) as max_drawdown,
        CASE
          WHEN ts.total_gross_losses = 0 THEN
            CASE WHEN ts.total_gross_wins > 0 THEN 999.99 ELSE 0 END
          ELSE ABS(ts.total_gross_wins / ts.total_gross_losses)
        END as profit_factor,
        CASE
          WHEN ts.total_trades = 0 THEN 0
          ELSE (ts.winning_trades * 100.0 / ts.total_trades)
        END as win_rate,
        CASE
          WHEN (ts.winning_trades + ts.losing_trades) = 0 THEN 0
          ELSE (ts.winning_trades * 100.0 / (ts.winning_trades + ts.losing_trades))
        END as win_rate_excluding_breakeven,
        CASE
          WHEN ts.pnl_stddev = 0 OR ts.pnl_stddev IS NULL THEN 0
          ELSE (ts.avg_pnl / ts.pnl_stddev)
        END as sharpe_ratio
      FROM trade_stats ts
      LEFT JOIN (
        SELECT
          MAX(daily_pnl) as max_daily_gain,
          MIN(daily_pnl) as max_daily_loss
        FROM daily_pnl
      ) dp ON true
      LEFT JOIN (
        SELECT
          MIN(drawdown) as max_drawdown,
          COUNT(*) as dd_count
        FROM drawdown_calc
      ) dd ON true
      LEFT JOIN drawdown_debug ddb ON true
      LEFT JOIN individual_trades it ON true
    `;

    const [
      executionResult,
      analyticsResult,
      symbolResult,
      dailyPnLResult,
      dailyWinRateResult,
      topTradesResult,
      bestWorstResult,
      recentTradePnlsResult
    ] = await Promise.all([
      timedDbQuery('analytics.executionCountQuery', executionCountQuery, values),
      timedDbQuery('analytics.analyticsQuery', analyticsQuery, values),
      timedDbQuery('analytics.symbolBreakdownQuery', groupByPosition ? `
        -- Whole-trade mode: one row per position (multi-leg groups collapsed),
        -- keyed by underlying so option legs roll up under their underlying.
        -- Matches the grouped completed_trades semantics above so this
        -- widget's "Trades" column agrees with the Win Rate card's total.
        WITH positions AS (
          SELECT
            COALESCE(NULLIF(underlying_symbol, ''), symbol) as symbol,
            SUM(pnl) as pnl,
            SUM(quantity) as volume
          FROM trades t
          ${whereClause}
            AND exit_price IS NOT NULL
            AND pnl IS NOT NULL
          GROUP BY COALESCE(NULLIF(underlying_symbol, ''), symbol), ${POSITION_GROUP_KEY}
        )
        SELECT
          symbol,
          COUNT(*) as trades,
          SUM(pnl) as total_pnl,
          AVG(pnl) as avg_pnl,
          COUNT(*) FILTER (WHERE pnl > 0) as wins,
          SUM(volume) as total_volume
        FROM positions
        GROUP BY symbol
        ORDER BY total_pnl DESC
        LIMIT 10
      ` : `
        -- One row per completed round-trip trade — matches analyticsQuery's
        -- completed_trades semantics so this widget's "Trades" column agrees
        -- with the Win Rate card's total. The old version pre-aggregated by
        -- (symbol, trade_date), which counted trading days per symbol instead
        -- of trades, hiding multiple intraday round-trips. See issue #330.
        SELECT
          symbol,
          COUNT(*) as trades,
          SUM(pnl) as total_pnl,
          AVG(pnl) as avg_pnl,
          COUNT(*) FILTER (WHERE pnl > 0) as wins,
          SUM(quantity) as total_volume
        FROM trades t
        ${whereClause}
          AND exit_price IS NOT NULL
          AND pnl IS NOT NULL
        GROUP BY symbol
        ORDER BY total_pnl DESC
        LIMIT 10
      `, values),
      timedDbQuery('analytics.dailyPnLQuery', `
        SELECT
          trade_date,
          SUM(COALESCE(pnl, 0)) as daily_pnl,
          SUM(SUM(COALESCE(pnl, 0))) OVER (ORDER BY trade_date) as cumulative_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as r_value,
          COALESCE(SUM(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL)) OVER (ORDER BY trade_date), 0) as cumulative_r_value,
          ${groupByPosition ? `COUNT(DISTINCT ${POSITION_GROUP_KEY})` : 'COUNT(*)'} as trade_count
        FROM trades t
        ${whereClause}
        GROUP BY trade_date
        HAVING COUNT(*) > 0
        ORDER BY trade_date
      `, values),
      timedDbQuery('analytics.dailyWinRateQuery', groupByPosition ? `
        -- Whole-trade mode: wins/losses counted per position, not per leg, so
        -- the Daily Win Rate & P/R Ratio widget matches the headline win rate.
        -- Grouped positions use the net-P&L breakeven (rounds to zero) since
        -- the per-leg tick tolerance doesn't apply to a combined position.
        WITH positions AS (
          SELECT
            MIN(trade_date) as trade_date,
            SUM(COALESCE(pnl, 0)) as pnl
          FROM trades t
          ${whereClause}
          GROUP BY ${POSITION_GROUP_KEY}
        )
        SELECT
          trade_date,
          COUNT(*) FILTER (WHERE ${GROUPED_BREAKEVEN.isNot} AND pnl > 0) as wins,
          COUNT(*) FILTER (WHERE ${GROUPED_BREAKEVEN.isNot} AND pnl < 0) as losses,
          COUNT(*) FILTER (WHERE ${GROUPED_BREAKEVEN.is}) as breakeven,
          COUNT(*) as total_trades,
          CASE
            WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE ${GROUPED_BREAKEVEN.isNot} AND pnl > 0)::decimal / COUNT(*)::decimal) * 100, 2)
            ELSE 0
          END as win_rate,
          CASE
            WHEN AVG(pnl) FILTER (WHERE ${GROUPED_BREAKEVEN.isNot} AND pnl < 0) IS NULL THEN
              CASE WHEN AVG(pnl) FILTER (WHERE ${GROUPED_BREAKEVEN.isNot} AND pnl > 0) IS NOT NULL THEN 999.99 ELSE 0 END
            ELSE ROUND(ABS(AVG(pnl) FILTER (WHERE ${GROUPED_BREAKEVEN.isNot} AND pnl > 0) / AVG(pnl) FILTER (WHERE ${GROUPED_BREAKEVEN.isNot} AND pnl < 0))::numeric, 2)
          END as pl_ratio
        FROM positions
        GROUP BY trade_date
        HAVING COUNT(*) > 0
        ORDER BY trade_date
      ` : `
        SELECT
          trade_date,
          COUNT(*) FILTER (WHERE ${beDaily.isNot} AND COALESCE(pnl, 0) > 0) as wins,
          COUNT(*) FILTER (WHERE ${beDaily.isNot} AND COALESCE(pnl, 0) < 0) as losses,
          COUNT(*) FILTER (WHERE ${beDaily.is}) as breakeven,
          COUNT(*) as total_trades,
          CASE
            WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE ${beDaily.isNot} AND COALESCE(pnl, 0) > 0)::decimal / COUNT(*)::decimal) * 100, 2)
            ELSE 0
          END as win_rate,
          CASE
            WHEN AVG(pnl) FILTER (WHERE ${beDaily.isNot} AND pnl < 0) IS NULL THEN
              CASE WHEN AVG(pnl) FILTER (WHERE ${beDaily.isNot} AND pnl > 0) IS NOT NULL THEN 999.99 ELSE 0 END
            ELSE ROUND(ABS(AVG(pnl) FILTER (WHERE ${beDaily.isNot} AND pnl > 0) / AVG(pnl) FILTER (WHERE ${beDaily.isNot} AND pnl < 0))::numeric, 2)
          END as pl_ratio
        FROM trades t
        ${whereClause}
        GROUP BY trade_date
        HAVING COUNT(*) > 0
        ORDER BY trade_date
      `, values),
      timedDbQuery('analytics.topTradesQuery', `
        (
          SELECT 'best' as type, id, symbol, entry_price, exit_price,
                 quantity, pnl, trade_date
          FROM trades t
          ${whereClause} AND pnl IS NOT NULL AND pnl > 0
          ORDER BY pnl DESC
          LIMIT 5
        )
        UNION ALL
        (
          SELECT 'worst' as type, id, symbol, entry_price, exit_price,
                 quantity, pnl, trade_date
          FROM trades t
          ${whereClause} AND pnl IS NOT NULL AND pnl < 0
          ORDER BY pnl ASC
          LIMIT 5
        )
      `, values),
      timedDbQuery('analytics.bestWorstCardsQuery', `
        (
          SELECT 'best' as type, id, symbol, pnl, trade_date
          FROM trades t
          ${whereClause} AND pnl IS NOT NULL AND pnl > 0
          ORDER BY pnl DESC
          LIMIT 1
        )
        UNION ALL
        (
          SELECT 'worst' as type, id, symbol, pnl, trade_date
          FROM trades t
          ${whereClause} AND pnl IS NOT NULL AND pnl < 0
          ORDER BY pnl ASC
          LIMIT 1
        )
      `, values),
      // Recent closed-trade P&Ls (chronological) for per-trade streak detection
      // on the dashboard StreakMomentumCard. Capped at 500 — far more than any
      // realistic winning/losing run, but still a small payload (~5 KB).
      timedDbQuery('analytics.recentTradePnlsQuery', `
        SELECT pnl, trade_date, exit_time
        FROM (
          SELECT pnl, trade_date, entry_time, exit_time
          FROM trades t
          ${whereClause}
            AND pnl IS NOT NULL
            AND exit_price IS NOT NULL
          ORDER BY exit_time DESC NULLS LAST,
                   trade_date DESC,
                   entry_time DESC NULLS LAST
          LIMIT 500
        ) recent
        ORDER BY exit_time ASC NULLS LAST,
                 trade_date ASC,
                 entry_time ASC NULLS LAST
      `, values)
    ]);

    const executionCount = parseInt(executionResult.rows[0].execution_count) || 0;
    const analytics = analyticsResult.rows[0];
    console.log('[PERF] getAnalytics total time:', Date.now() - analyticsStartedAt, 'ms');

    const bestTrade = bestWorstResult.rows.find(t => t.type === 'best') || null;
    const worstTrade = bestWorstResult.rows.find(t => t.type === 'worst') || null;
    const totalTrades = parseInt(analytics.total_trades) || 0;
    const totalNetPnL = parseFloat(analytics.total_pnl) || 0;
    const totalGrossPnL = (parseFloat(analytics.total_pnl) || 0) + (parseFloat(analytics.total_costs) || 0);
    const totalCosts = parseFloat(analytics.total_costs) || 0;
    const avgNetPnL = totalTrades > 0 ? totalNetPnL / totalTrades : 0;
    const avgGrossPnL = totalTrades > 0 ? totalGrossPnL / totalTrades : 0;

    return {
      summary: {
        totalTrades,
        totalExecutions: executionCount,
        winningTrades: parseInt(analytics.winning_trades) || 0,
        losingTrades: parseInt(analytics.losing_trades) || 0,
        breakevenTrades: parseInt(analytics.breakeven_trades) || 0,
        totalPnL: totalNetPnL,
        totalNetPnL,
        totalGrossPnL,
        avgPnL: parseFloat(analytics.avg_pnl) || 0,
        avgNetPnL,
        avgGrossPnL,
        avgWin: parseFloat(analytics.avg_win) || 0,
        avgLoss: parseFloat(analytics.avg_loss) || 0,
        bestTrade: parseFloat(analytics.best_trade) || 0,
        worstTrade: parseFloat(analytics.worst_trade) || 0,
        totalCosts,
        winRate: parseFloat(analytics.win_rate) || 0,
        winRateExcludingBreakeven: parseFloat(analytics.win_rate_excluding_breakeven) || 0,
        profitFactor: parseFloat(analytics.profit_factor) || 0,
        sharpeRatio: parseFloat(analytics.sharpe_ratio) || 0,
        maxDrawdown: parseFloat(analytics.max_drawdown) || 0,
        maxDailyGain: parseFloat(analytics.max_daily_gain) || 0,
        maxDailyLoss: parseFloat(analytics.max_daily_loss) || 0,
        symbolsTraded: parseInt(analytics.symbols_traded) || 0,
        tradingDays: parseInt(analytics.trading_days) || 0,
        avgReturnPercent: parseFloat(analytics.avg_return_pct) || 0,
        avgRValue: parseFloat(analytics.avg_r_value) || 0,
        totalRValue: parseFloat(analytics.total_r_value) || 0
      },
      performanceBySymbol: symbolResult.rows,
      dailyPnL: dailyPnLResult.rows,
      dailyWinRate: dailyWinRateResult.rows,
      recentTradePnls: recentTradePnlsResult.rows,
      topTrades: {
        best: topTradesResult.rows.filter(t => t.type === 'best'),
        worst: topTradesResult.rows.filter(t => t.type === 'worst')
      },
      bestTradeDetails: bestTrade,
      worstTradeDetails: worstTrade
    };
  }

  // Canonical cache key for an analytics request. Drops empty/null/undefined
  // values and sorts multi-select arrays so equivalent filter sets produce
  // the same key regardless of input ordering.
  static cacheKey(userId, filters = {}) {
    const canonical = {};
    const keys = Object.keys(filters).sort();
    for (const k of keys) {
      const v = filters[k];
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        if (v.length === 0) continue;
        canonical[k] = [...v].sort();
      } else {
        canonical[k] = v;
      }
    }
    return `analytics:user_${userId}:${JSON.stringify(canonical)}`;
  }
}

module.exports = TradeQueries;
