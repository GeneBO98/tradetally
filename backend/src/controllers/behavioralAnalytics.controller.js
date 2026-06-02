const BehavioralAnalyticsService = require('../services/behavioralAnalyticsService');
const BehavioralAnalyticsServiceV2 = require('../services/behavioralAnalyticsServiceV2');
const OverconfidenceAnalyticsService = require('../services/overconfidenceAnalyticsService');
const LossAversionAnalyticsService = require('../services/lossAversionAnalyticsService');
const TradingPersonalityService = require('../services/tradingPersonalityService');
const RevengeTradeDetector = require('../services/revengeTradeDetector');
const TierService = require('../services/tierService');
const TickDataService = require('../services/tickDataService');
const db = require('../config/database');
const ensureString = require('../utils/ensureString');

const behavioralAnalyticsController = {
  
  // Get behavioral analytics overview
  async getOverview(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, accounts } = req.query;

      const dateFilter = {};
      if (startDate) dateFilter.startDate = startDate;
      if (endDate) dateFilter.endDate = endDate;
      if (accounts) dateFilter.accounts = ensureString(accounts).split(',');

      const overview = await BehavioralAnalyticsService.getBehavioralOverview(userId, dateFilter);
      
      res.json({
        success: true,
        data: overview
      });
    } catch (error) {
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Get revenge trading analysis
  async getRevengeTradeAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, page, limit, accounts } = req.query;

      const dateFilter = {};
      if (startDate) dateFilter.startDate = startDate;
      if (endDate) dateFilter.endDate = endDate;
      if (accounts) dateFilter.accounts = ensureString(accounts).split(',');

      const paginationOptions = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      };

      const analysis = await BehavioralAnalyticsService.getRevengeTradeAnalysis(userId, dateFilter, paginationOptions);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Get user behavioral settings
  async getSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = await BehavioralAnalyticsService.getBehavioralSettings(userId);
      
      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      next(error);
    }
  },

  // Update user behavioral settings
  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = req.body;

      // Validate settings structure
      if (!behavioralAnalyticsController.validateSettings(settings)) {
        return res.status(400).json({
          error: 'Invalid settings format',
          message: 'Please provide valid behavioral settings'
        });
      }

      const updatedSettings = await BehavioralAnalyticsService.updateBehavioralSettings(userId, settings);
      
      res.json({
        success: true,
        data: updatedSettings,
        message: 'Behavioral settings updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Get active alerts for user
  async getActiveAlerts(req, res, next) {
    try {
      const userId = req.user.id;
      const alerts = await BehavioralAnalyticsService.getActiveAlerts(userId);
      
      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      next(error);
    }
  },

  // Acknowledge an alert
  async acknowledgeAlert(req, res, next) {
    try {
      const userId = req.user.id;
      const { alertId } = req.params;
      const { response } = req.body;

      const acknowledgedAlert = await BehavioralAnalyticsService.acknowledgeAlert(userId, alertId, response);
      
      if (!acknowledgedAlert) {
        return res.status(404).json({
          error: 'Alert not found',
          message: 'The specified alert was not found or does not belong to you'
        });
      }

      res.json({
        success: true,
        data: acknowledgedAlert,
        message: 'Alert acknowledged successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Analyze a trade for revenge trading (used internally)
  async analyzeTrade(req, res, next) {
    try {
      const userId = req.user.id;
      const { trade } = req.body;

      if (!trade) {
        return res.status(400).json({
          error: 'Missing trade data',
          message: 'Trade information is required for analysis'
        });
      }

      const analysis = await RevengeTradeDetector.analyzeNewTrade(userId, trade);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      next(error);
    }
  },

  // Check if user should be blocked from trading
  async getTradeBlockStatus(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Check if user has trade blocking feature
      const hasAccess = await TierService.hasFeatureAccess(userId, 'trade_blocking');
      if (!hasAccess) {
        return res.json({
          success: true,
          data: { shouldBlock: false, reason: 'feature_not_available' }
        });
      }

      // Get user settings
      const settings = await BehavioralAnalyticsService.getBehavioralSettings(userId);
      
      if (!settings.tradeBlocking?.enabled) {
        return res.json({
          success: true,
          data: { shouldBlock: false, reason: 'blocking_disabled' }
        });
      }

      // Check for recent high-severity alerts
      const activeAlerts = await BehavioralAnalyticsService.getActiveAlerts(userId);
      const blockingAlerts = activeAlerts.filter(alert => 
        alert.alert_type === 'blocking' && 
        alert.status === 'active'
      );

      if (blockingAlerts.length > 0) {
        return res.json({
          success: true,
          data: { 
            shouldBlock: true, 
            reason: 'behavioral_alert',
            alerts: blockingAlerts,
            recommendedCoolingPeriod: settings.coolingPeriod?.minutes || 30
          }
        });
      }

      res.json({
        success: true,
        data: { shouldBlock: false, reason: 'no_blocking_conditions' }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get behavioral insights and recommendations
  async getInsights(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, accounts } = req.query;

      const dateFilter = {};
      if (startDate) dateFilter.startDate = startDate;
      if (endDate) dateFilter.endDate = endDate;
      if (accounts) dateFilter.accounts = ensureString(accounts).split(',');
      
      // Get recent patterns and statistics
      const overview = await BehavioralAnalyticsService.getBehavioralOverview(userId, dateFilter);
      const revengeAnalysis = await BehavioralAnalyticsService.getRevengeTradeAnalysis(userId, dateFilter);
      
      // Generate insights based on data
      const insights = behavioralAnalyticsController.generateInsights(overview, revengeAnalysis);
      
      res.json({
        success: true,
        data: insights
      });
    } catch (error) {
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Dashboard BehavioralAlertsCard summary. Two layers of data:
  //   1) Lightweight `derived` signals computed on the fly from the user's
  //      trades — works for everyone (free and Pro), no behavioral pipeline
  //      required. Surfaces revenge proxy, hot/cold streak, position-size
  //      drift, big-loss recency.
  //   2) `pro` block: full behavioral pipeline data (patterns + alerts).
  //      Populated only when the user is on Pro and the service responds.
  //      Free users see `pro: { upgrade_required: true }` so the frontend
  //      can render the upsell.
  async getDashboardSummary(req, res, next) {
    try {
      const userId = req.user.id;

      // Mirror the trade-list/analytics filter shape so dashboard filters
      // (tags, strategies, accounts, date range, etc.) flow through to the
      // derived-signal SQL via TradeQueries._buildWhereClause.
      const {
        startDate, endDate, symbol, symbolExact, sector, strategy, tags,
        strategies, sectors,
        side, minPrice, maxPrice, minQuantity, maxQuantity,
        status, minPnl, maxPnl, broker, brokers, importId, accounts, hasNews,
        holdTime, daysOfWeek, instrumentTypes, optionTypes, qualityGrades
      } = req.query;

      const filters = {
        startDate,
        endDate,
        symbol,
        symbolExact: symbolExact === 'true',
        sector,
        strategy,
        tags: tags ? ensureString(tags).split(',').map(t => t.trim()).filter(Boolean) : undefined,
        strategies: strategies ? ensureString(strategies).split(',') : undefined,
        sectors: sectors ? ensureString(sectors).split(',') : undefined,
        side,
        minPrice,
        maxPrice,
        minQuantity,
        maxQuantity,
        status,
        minPnl,
        maxPnl,
        broker: broker || undefined,
        brokers: brokers || undefined,
        importId,
        accounts: accounts ? ensureString(accounts).split(',') : undefined,
        hasNews,
        holdTime,
        daysOfWeek: daysOfWeek ? ensureString(daysOfWeek).split(',').map(d => parseInt(d)) : undefined,
        instrumentTypes: instrumentTypes ? ensureString(instrumentTypes).split(',') : undefined,
        optionTypes: optionTypes ? ensureString(optionTypes).split(',') : undefined,
        qualityGrades: qualityGrades ? ensureString(qualityGrades).split(',') : undefined
      };

      // === Layer 1: trade-derived signals (always computed) ===
      const derived = await behavioralAnalyticsController
        .computeDerivedRiskSignals(userId, filters)
        .catch(err => {
          console.warn('[BEHAVIORAL] derived signals failed:', err.message);
          return null;
        });

      // === Layer 2: Pro behavioral pipeline (Pro users only) ===
      let proBlock = null;
      try {
        const TierService = require('../services/tierService');
        const billingEnabled = await TierService.isBillingEnabled();
        const tier = billingEnabled ? await TierService.getUserTier(userId) : 'pro';

        if (tier === 'pro') {
          const [overview, alerts] = await Promise.all([
            BehavioralAnalyticsService.getBehavioralOverview(userId, {}).catch(() => null),
            BehavioralAnalyticsService.getActiveAlerts(userId).catch(() => [])
          ]);

          const topAlert = (alerts && alerts.length > 0) ? alerts[0] : null;
          const patterns = (overview && overview.patterns) ? overview.patterns : [];
          const signals = patterns.map(p => ({
            pattern_type: p.pattern_type,
            total_occurrences: parseInt(p.total_occurrences) || 0,
            high_severity_count: parseInt(p.high_severity_count) || 0,
            last_occurrence: p.last_occurrence
          })).slice(0, 3);

          proBlock = {
            available: true,
            active_alert: topAlert ? {
              id: topAlert.id,
              alert_type: topAlert.alert_type,
              pattern_type: topAlert.pattern_type,
              severity: topAlert.pattern_severity || topAlert.severity,
              title: topAlert.title,
              message: topAlert.message,
              created_at: topAlert.created_at
            } : null,
            active_alert_count: alerts ? alerts.length : 0,
            signals
          };
        } else {
          proBlock = { available: false, upgrade_required: true };
        }
      } catch (err) {
        console.warn('[BEHAVIORAL] pro pipeline lookup failed:', err.message);
        proBlock = { available: false };
      }

      // Combine for top-level convenience fields the existing frontend
      // already reads. Derived signals fill in when no Pro alert/signals.
      const proSignals = proBlock?.signals || [];
      const hasProData = !!(proBlock?.active_alert || proSignals.length > 0);
      const derivedSignals = derived?.signals || [];
      const allClear = !hasProData && derivedSignals.length === 0;

      return res.json({
        success: true,
        data: {
          // Top-level fields kept for the existing frontend contract.
          active_alert: proBlock?.active_alert || null,
          active_alert_count: proBlock?.active_alert_count || 0,
          signals: proSignals,
          all_clear: allClear,
          // New fields.
          derived,                 // { signals: [...], summary: {...} }
          pro: proBlock            // { available, active_alert?, ... } | { available:false, upgrade_required:true }
        }
      });
    } catch (error) {
      if (error.message && error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Compute lightweight risk signals from the user's trades. No external
  // services, no heavy pipeline — just SQL over the trades table. Returns
  // an array of signal objects sorted by severity. The card always has
  // something useful to render when the user has trade history: if no
  // risk thresholds fire, we still emit at least one informational signal
  // about their current state so "all clear" actually means something.
  async computeDerivedRiskSignals(userId, filters = {}) {
    const db = require('../config/database');
    const TradeQueries = require('../services/tradeQueries');
    const signals = [];

    // Apply the user's dashboard filter spec (tags, strategies, accounts, etc.)
    // via the canonical WHERE builder so signals stay consistent with the
    // trade list and analytics. Default to a 180-day floor only when no
    // explicit startDate is supplied — keeps existing default-window behavior.
    const { whereClause: userWhere, values } = await TradeQueries._buildWhereClause(
      userId,
      filters
    );
    const defaultWindowClause = !filters.startDate
      ? `AND t.trade_date >= CURRENT_DATE - INTERVAL '180 days'`
      : '';

    // 180-day window so signals work for demo / sparse-recent-activity users.
    // Streak detection only needs the tail of this; everything else uses the
    // full window for stability.
    const ctx = await db.query(`
      WITH closed AS (
        SELECT
          t.id, t.trade_date, t.entry_time, t.exit_time, t.pnl, t.quantity, t.side,
          t.symbol, t.strategy,
          -- Notional size proxy: weight raw quantity by contract multiplier so
          -- comparisons stay coherent across instrument types. Futures use
          -- point_value (ES=50, MES=5), stocks/options fall back to entry_price.
          -- Without this, 1 ES contract reads as a "sizing down" vs 7 MES even
          -- though ES is 10x the notional. See GitHub issue #330.
          (t.quantity * COALESCE(NULLIF(t.point_value, 0), t.entry_price, 1))::numeric AS notional
        FROM trades t
        ${userWhere}
          AND t.exit_price IS NOT NULL
          AND t.pnl IS NOT NULL
          ${defaultWindowClause}
        ORDER BY t.trade_date DESC, t.entry_time DESC
      ),
      recent30 AS (
        SELECT * FROM closed WHERE trade_date >= CURRENT_DATE - INTERVAL '30 days'
      ),
      daily AS (
        SELECT trade_date,
               COALESCE(SUM(pnl), 0)::numeric AS day_pnl,
               COUNT(*)::integer AS day_trades
        FROM closed
        GROUP BY trade_date
        ORDER BY trade_date
      )
      SELECT
        (SELECT COUNT(*) FROM closed)::integer AS recent_count,
        (SELECT COUNT(*) FROM recent30)::integer AS r30_count,
        (SELECT COUNT(*) FILTER (WHERE pnl > 0) FROM recent30)::integer AS r30_wins,
        (SELECT COUNT(*) FILTER (WHERE pnl < 0) FROM recent30)::integer AS r30_losses,
        (SELECT COALESCE(SUM(pnl), 0) FROM recent30)::numeric AS r30_pnl,
        (SELECT COALESCE(AVG(ABS(pnl)), 0) FROM closed WHERE pnl < 0)::numeric AS avg_loss,
        (SELECT COALESCE(AVG(notional), 0) FROM closed)::numeric AS avg_notional,
        (SELECT COALESCE(AVG(notional), 0) FROM closed
          WHERE trade_date >= CURRENT_DATE - INTERVAL '14 days')::numeric AS recent_avg_notional,
        (SELECT pnl FROM closed ORDER BY trade_date DESC, exit_time DESC NULLS LAST LIMIT 1) AS last_pnl,
        (SELECT json_agg(json_build_object('day', trade_date, 'pnl', day_pnl, 'count', day_trades)
                ORDER BY trade_date)
          FROM daily) AS daily_rows,
        (SELECT json_agg(pnl ORDER BY rn) FROM (
            SELECT pnl,
                   ROW_NUMBER() OVER (ORDER BY exit_time DESC NULLS LAST,
                                               trade_date DESC,
                                               entry_time DESC NULLS LAST) AS rn
            FROM closed
          ) ordered
          WHERE rn <= 100) AS recent_trade_pnls
    `, values);
    const row = ctx.rows[0] || {};
    const recentCount = parseInt(row.recent_count) || 0;

    // Need at least some history to compute anything meaningful.
    if (recentCount < 10) {
      return { signals: [], summary: { recent_trades: recentCount, ready: false } };
    }

    const avgLoss = parseFloat(row.avg_loss) || 0;
    const avgNotional = parseFloat(row.avg_notional) || 0;
    const recentAvgNotional = parseFloat(row.recent_avg_notional) || 0;
    const daily = Array.isArray(row.daily_rows) ? row.daily_rows : [];
    const recentTradePnls = Array.isArray(row.recent_trade_pnls) ? row.recent_trade_pnls : [];
    const r30Count = parseInt(row.r30_count) || 0;
    const r30Wins = parseInt(row.r30_wins) || 0;
    const r30Losses = parseInt(row.r30_losses) || 0;
    const r30Pnl = parseFloat(row.r30_pnl) || 0;
    const r30WinRate = r30Count > 0 ? (r30Wins / r30Count) * 100 : null;

    // --- 1. Revenge-trade proxy: trade opened within 30 min of a losing exit.
    try {
      const revenge = await db.query(`
        WITH closed AS (
          SELECT t.id, t.entry_time, t.exit_time, t.pnl
          FROM trades t
          ${userWhere}
            AND t.exit_price IS NOT NULL
            AND t.pnl IS NOT NULL
            AND t.trade_date >= CURRENT_DATE - INTERVAL '60 days'
        )
        SELECT COUNT(*)::integer AS hits
        FROM closed t1
        JOIN closed t2
          ON t2.entry_time > t1.exit_time
         AND t2.entry_time <= t1.exit_time + INTERVAL '30 minutes'
        WHERE t1.pnl < 0
      `, values);
      const hits = parseInt(revenge.rows[0]?.hits) || 0;
      if (hits >= 2) {
        signals.push({
          key: 'revenge_proxy',
          label: 'Revenge-trade pattern',
          severity: hits >= 8 ? 'high' : hits >= 4 ? 'medium' : 'low',
          value: hits,
          unit: 'within 30m of a loss · 60 days',
          message: `You've opened ${hits} trade${hits === 1 ? '' : 's'} within 30 minutes of a loss in the last 60 days. Set a cooling-off rule of at least 15 minutes after any loss before entering a new position.`
        });
      }
    } catch (err) {
      console.warn('[BEHAVIORAL] revenge proxy failed:', err.message);
    }

    // --- 2. Win/loss day streak.
    let streak = 0;
    let streakKind = null;
    for (let i = daily.length - 1; i >= 0; i--) {
      const p = parseFloat(daily[i].pnl) || 0;
      const kind = p > 0 ? 'W' : p < 0 ? 'L' : 'B';
      if (streakKind === null) streakKind = kind;
      if (kind === streakKind && kind !== 'B') streak++;
      else if (kind !== streakKind) break;
    }
    if (streakKind === 'W' && streak >= 4) {
      signals.push({
        key: 'hot_streak',
        label: 'Hot streak — watch for overconfidence',
        severity: streak >= 7 ? 'high' : 'medium',
        value: streak,
        unit: 'winning days in a row',
        message: `${streak} winning days in a row. Stay mechanical — overconfidence creep is the usual end of streaks. Don't size up just because you've been right.`
      });
    } else if (streakKind === 'L' && streak >= 2) {
      signals.push({
        key: 'cold_streak',
        label: 'Cold streak — pause and reset',
        severity: streak >= 4 ? 'high' : 'medium',
        value: streak,
        unit: 'losing days in a row',
        message: `${streak} losing days in a row. Cut size in half on the next session or step away entirely until you've reviewed what's misaligned with your model.`
      });
    }

    // --- 2b. Per-trade win/loss streak.
    // Walks the most recent closed trades by exit_time. Independent of the
    // daily streak above — a single bad day can hide a long losing run inside
    // it (or a great day can mask a cold streak that ended on one big win).
    let tradeStreak = 0;
    let tradeStreakKind = null;
    for (const p of recentTradePnls) {
      const pnl = parseFloat(p);
      if (!Number.isFinite(pnl)) continue;
      const kind = pnl > 0 ? 'W' : pnl < 0 ? 'L' : 'B';
      if (tradeStreakKind === null) tradeStreakKind = kind;
      if (kind === tradeStreakKind && kind !== 'B') tradeStreak++;
      else if (kind !== tradeStreakKind) break;
    }
    if (tradeStreakKind === 'W' && tradeStreak >= 5) {
      signals.push({
        key: 'hot_trade_streak',
        label: 'Hot trade streak',
        severity: tradeStreak >= 10 ? 'high' : 'medium',
        value: tradeStreak,
        unit: 'winning trades in a row',
        message: `${tradeStreak} winning trades in a row. Strong run — stay mechanical and don't let confidence push you into oversized or off-plan entries.`
      });
    } else if (tradeStreakKind === 'L' && tradeStreak >= 3) {
      signals.push({
        key: 'cold_trade_streak',
        label: 'Cold trade streak',
        severity: tradeStreak >= 6 ? 'high' : 'medium',
        value: tradeStreak,
        unit: 'losing trades in a row',
        message: `${tradeStreak} losing trades in a row. Step away from the screen, review the losers for a common thread, and reduce size on the next entry.`
      });
    }

    // --- 3. Position-size drift.
    // Uses notional (quantity * point_value or entry_price), not raw quantity,
    // so it doesn't misread a switch from 7 MES contracts to 1 ES contract as
    // "sizing down" when notional actually grew. See issue #330.
    if (avgNotional > 0 && recentAvgNotional > 0) {
      const ratio = recentAvgNotional / avgNotional;
      if (ratio >= 1.4) {
        signals.push({
          key: 'size_drift_up',
          label: 'Position size has crept up',
          severity: ratio >= 2 ? 'high' : 'medium',
          value: ratio.toFixed(2) + 'x',
          unit: 'vs your 180d average',
          message: `Your last-14-day average position notional is ${ratio.toFixed(1)}x your historical average. Either you've intentionally sized up or you're risking more — confirm it's deliberate and that your stops scaled with it.`
        });
      } else if (ratio <= 0.6) {
        signals.push({
          key: 'size_drift_down',
          label: 'Trading scared — sizing down',
          severity: 'low',
          value: `${(ratio * 100).toFixed(0)}%`,
          unit: 'of normal size',
          message: `Your recent position notional is only ${(ratio * 100).toFixed(0)}% of your historical average. Small sizes after losses are healthy, but undersizing when your edge is intact leaves edge on the table.`
        });
      }
    }

    // --- 4. Outsized last loss.
    const lastPnl = parseFloat(row.last_pnl);
    if (Number.isFinite(lastPnl) && lastPnl < 0 && avgLoss > 0) {
      const ratio = Math.abs(lastPnl) / avgLoss;
      if (ratio >= 2) {
        signals.push({
          key: 'oversize_loss',
          label: 'Recent loss was outsized',
          severity: ratio >= 4 ? 'high' : ratio >= 3 ? 'medium' : 'low',
          value: ratio.toFixed(1) + 'x',
          unit: 'your avg loss',
          message: `Your last loss was ${ratio.toFixed(1)}x your average loss. That usually means a stop wasn't honored or position size grew unchecked — revisit the trade and reinforce the rule.`
        });
      }
    }

    // --- 5. Recent win rate drift (last 30 days vs 180-day baseline).
    if (r30Count >= 10 && recentCount >= 30) {
      const baselineCount = recentCount - r30Count;
      if (baselineCount >= 20) {
        const baseWinsResult = await db.query(`
          SELECT COUNT(*) FILTER (WHERE t.pnl > 0)::numeric AS wins,
                 COUNT(*)::numeric AS total
          FROM trades t
          ${userWhere}
            AND t.exit_price IS NOT NULL AND t.pnl IS NOT NULL
            AND t.trade_date < CURRENT_DATE - INTERVAL '30 days'
            AND t.trade_date >= CURRENT_DATE - INTERVAL '180 days'
        `, values);
        const baseTotal = parseFloat(baseWinsResult.rows[0]?.total) || 0;
        const baseWins = parseFloat(baseWinsResult.rows[0]?.wins) || 0;
        if (baseTotal > 0) {
          const baseWinRate = (baseWins / baseTotal) * 100;
          const delta = r30WinRate - baseWinRate;
          if (delta <= -10) {
            signals.push({
              key: 'win_rate_drop',
              label: 'Win rate has dropped',
              severity: delta <= -20 ? 'high' : 'medium',
              value: `${delta.toFixed(0)}%`,
              unit: 'vs 31-180d baseline',
              message: `Your last 30 days have a ${r30WinRate.toFixed(0)}% win rate vs ${baseWinRate.toFixed(0)}% over the prior 5 months. Pull a sample of recent losers and identify what's broken before scaling up.`
            });
          } else if (delta >= 10) {
            signals.push({
              key: 'win_rate_jump',
              label: 'Win rate is unusually high',
              severity: 'low',
              value: `+${delta.toFixed(0)}%`,
              unit: 'vs 31-180d baseline',
              message: `Last 30 days at ${r30WinRate.toFixed(0)}% win rate vs ${baseWinRate.toFixed(0)}% baseline. Could be a strong period or could be a small sample — verify before sizing up.`
            });
          }
        }
      }
    }

    // --- 6. ALWAYS-ON info signal: recent state snapshot.
    // Ensures the card never reads "all clear" while invisible context exists.
    // Prefers a 30-day window for "freshness", but falls back to the full
    // 180-day window when the user has no activity in the last month
    // (e.g. demo data, sparse-trading users) so the card still has content.
    let snapshotWindow = '30 days';
    let snapshotCount = r30Count;
    let snapshotWins = r30Wins;
    let snapshotLosses = r30Losses;
    let snapshotPnl = r30Pnl;
    if (r30Count === 0 && recentCount > 0) {
      // Fall back to the full 180-day window using data we already have.
      snapshotWindow = '180 days';
      snapshotCount = recentCount;
      // Compute wins/losses/pnl for the full window from the daily rollup.
      let wins = 0, losses = 0, pnl = 0;
      for (const d of daily) {
        const p = parseFloat(d.pnl) || 0;
        pnl += p;
        // daily.pnl is the SUM of trade pnls for that day; we don't have per-trade
        // breakdown here, so wins/losses are inferred from daily P&L sign. Close
        // enough for a summary snapshot.
        if (p > 0) wins += parseInt(d.count) || 0;
        else if (p < 0) losses += parseInt(d.count) || 0;
      }
      snapshotWins = wins;
      snapshotLosses = losses;
      snapshotPnl = pnl;
    }
    if (snapshotCount > 0) {
      const wr = snapshotCount > 0 ? (snapshotWins / snapshotCount) * 100 : null;
      const wrLabel = wr !== null ? `${wr.toFixed(0)}% win rate` : '';
      const pnlSign = snapshotPnl >= 0 ? '+' : '';
      const pnlLabel = `${pnlSign}$${snapshotPnl.toFixed(0)}`;
      const streakLabel = streakKind === 'W' && streak > 0 ? `, ${streak}W streak`
        : streakKind === 'L' && streak > 0 ? `, ${streak}L streak`
        : '';
      signals.push({
        key: 'recent_snapshot',
        label: `Last ${snapshotWindow}`,
        severity: 'info',
        value: pnlLabel,
        unit: `${snapshotCount} trades${streakLabel}`,
        message: `${snapshotCount} trades · ${wrLabel} · ${pnlLabel} net. ${snapshotPnl >= 0 ? 'Stable risk profile — keep doing what you\'re doing.' : 'Net negative — review your last 10 losers to find the common thread.'}`
      });
    }

    // Sort: high → medium → low → info.
    signals.sort((a, b) => {
      const order = { high: 4, medium: 3, low: 2, info: 1 };
      return (order[b.severity] || 0) - (order[a.severity] || 0);
    });

    return {
      signals,
      summary: {
        recent_trades: recentCount,
        ready: true
      }
    };
  },

  // Validate settings format
  validateSettings(settings) {
    if (!settings || typeof settings !== 'object') return false;
    
    // Check required structure
    const validStructure = (
      (!settings.revengeTrading || (
        typeof settings.revengeTrading.enabled === 'boolean' &&
        ['low', 'medium', 'high'].includes(settings.revengeTrading.sensitivity)
      )) &&
      (!settings.coolingPeriod || (
        typeof settings.coolingPeriod.minutes === 'number' &&
        settings.coolingPeriod.minutes >= 0 && settings.coolingPeriod.minutes <= 1440
      )) &&
      (!settings.tradeBlocking || typeof settings.tradeBlocking.enabled === 'boolean') &&
      (!settings.alertPreferences || typeof settings.alertPreferences === 'object')
    );

    return validStructure;
  },

  // Generate insights from behavioral data
  generateInsights(overview, revengeAnalysis) {
    const insights = [];
    
    // Revenge trading insights
    if (revengeAnalysis.statistics?.total_events > 0) {
      const stats = revengeAnalysis.statistics;
      
      if (parseFloat(stats.loss_rate) > 70) {
        insights.push({
          type: 'warning',
          title: 'High Revenge Trading Loss Rate',
          message: `${stats.loss_rate}% of your revenge trading events resulted in additional losses.`,
          recommendation: 'Consider implementing cooling periods after losses.',
          severity: 'high'
        });
      }
      
      if (parseFloat(stats.avg_size_increase) > 25) {
        insights.push({
          type: 'risk',
          title: 'Position Size Escalation',
          message: `You tend to increase position sizes by ${parseFloat(stats.avg_size_increase).toFixed(2)}% during revenge trading.`,
          recommendation: 'Set strict position sizing rules to prevent emotional scaling.',
          severity: 'medium'
        });
      }
      
      if (parseFloat(stats.cooling_period_usage_rate) < 30) {
        insights.push({
          type: 'improvement',
          title: 'Low Cooling Period Usage',
          message: `You use cooling periods only ${stats.cooling_period_usage_rate}% of the time.`,
          recommendation: 'Try setting automatic cooling periods after losses.',
          severity: 'low'
        });
      }
    }
    
    // Pattern frequency insights
    const revengePattern = overview.patterns?.find(p => p.pattern_type === 'revenge_trading');
    if (revengePattern && revengePattern.total_occurrences > 5) {
      insights.push({
        type: 'pattern',
        title: 'Frequent Revenge Trading',
        message: `Revenge trading detected ${revengePattern.total_occurrences} times recently.`,
        recommendation: 'Consider adjusting your trading plan to include mandatory breaks after losses.',
        severity: revengePattern.high_severity_count > 3 ? 'high' : 'medium'
      });
    }
    
    return {
      insights,
      overallRisk: behavioralAnalyticsController.calculateOverallRisk(overview, revengeAnalysis),
      recommendations: behavioralAnalyticsController.generateRecommendations(insights)
    };
  },

  // Calculate overall behavioral risk score
  calculateOverallRisk(overview, revengeAnalysis) {
    let riskScore = 0;
    
    // Revenge trading risk
    if (revengeAnalysis.statistics?.loss_rate) {
      riskScore += parseFloat(revengeAnalysis.statistics.loss_rate) / 10;
    }
    
    // Pattern frequency risk
    const revengePattern = overview.patterns?.find(p => p.pattern_type === 'revenge_trading');
    if (revengePattern) {
      riskScore += revengePattern.high_severity_count * 10;
    }
    
    // Cap at 100
    riskScore = Math.min(riskScore, 100);
    
    let riskLevel = 'low';
    if (riskScore > 70) riskLevel = 'high';
    else if (riskScore > 40) riskLevel = 'medium';
    
    return {
      score: Math.round(riskScore),
      level: riskLevel,
      description: behavioralAnalyticsController.getRiskDescription(riskLevel)
    };
  },

  // Get risk level description
  getRiskDescription(level) {
    const descriptions = {
      low: 'Your trading behavior shows minimal emotional patterns.',
      medium: 'Some concerning patterns detected. Consider implementing safeguards.',
      high: 'High-risk emotional trading patterns detected. Immediate action recommended.'
    };
    return descriptions[level] || descriptions.low;
  },

  // Generate actionable recommendations
  generateRecommendations(insights) {
    const recommendations = [];
    
    if (insights.some(i => i.type === 'warning' || i.severity === 'high')) {
      recommendations.push({
        priority: 'high',
        action: 'Enable automatic trade blocking during high-risk periods',
        benefit: 'Prevents emotional decision-making during vulnerable moments'
      });
    }
    
    if (insights.some(i => i.title.includes('Cooling Period'))) {
      recommendations.push({
        priority: 'medium',
        action: 'Implement mandatory 30-minute cooling periods after losses',
        benefit: 'Allows time for emotional regulation before making new trading decisions'
      });
    }
    
    recommendations.push({
      priority: 'low',
      action: 'Review your trading plan after each session',
      benefit: 'Helps identify patterns and improve decision-making over time'
    });
    
    return recommendations;
  },

  // Analyze historical trades for behavioral patterns
  async analyzeHistoricalTrades(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, accounts } = req.query;
      
      // Check if user has access to behavioral analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Historical analysis requires Pro tier access',
          upgradeRequired: true
        });
      }

      // Use the improved V2 version for proper revenge trade aggregation
      const dateFilter = {};
      if (startDate) dateFilter.startDate = startDate;
      if (endDate) dateFilter.endDate = endDate;
      if (accounts) dateFilter.accounts = ensureString(accounts).split(',');

      const analysis = await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2(userId, dateFilter);
      
      res.json({
        success: true,
        data: analysis,
        message: `Historical analysis complete. Analyzed ${analysis.tradesAnalyzed} trades and detected ${analysis.patternsDetected} behavioral patterns.`
      });
    } catch (error) {
      console.error('Error analyzing historical trades:', error);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Get tick data analysis for a revenge trade
  async getRevengeTradeTickData(req, res, next) {
    try {
      const userId = req.user.id;
      const { revengeTradeId } = req.params;
      const { windowMinutes = 30 } = req.query;
      
      // Check if user has access to behavioral analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Tick data analysis requires Pro tier access',
          upgradeRequired: true
        });
      }

      // Get existing tick analysis
      const existingAnalysis = await TickDataService.getTickAnalysis(userId, revengeTradeId);
      
      if (existingAnalysis) {
        // Get tick data for visualization
        const tickData = await TickDataService.getTicksAroundTime(
          existingAnalysis.symbol,
          existingAnalysis.trade_entry_time,
          parseInt(windowMinutes)
        );
        
        res.json({
          success: true,
          data: {
            analysis: existingAnalysis,
            tickData: tickData
          }
        });
      } else {
        res.status(404).json({
          error: 'Tick analysis not found',
          message: 'No tick data analysis found for this revenge trade'
        });
      }
    } catch (error) {
      console.error('Error getting revenge trade tick data:', error);
      next(error);
    }
  },

  // Generate tick data analysis for a revenge trade
  async generateTickDataAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      const { revengeTradeId } = req.params;
      const { triggerTradeId, symbol, tradeEntryTime, tradeExitTime, windowMinutes = 30 } = req.body;
      
      // Check if user has access to behavioral analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Tick data analysis requires Pro tier access',
          upgradeRequired: true
        });
      }

      // Validate required fields
      if (!triggerTradeId || !symbol || !tradeEntryTime) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'triggerTradeId, symbol, and tradeEntryTime are required'
        });
      }

      // Generate tick data analysis
      const analysis = await TickDataService.analyzeRevengeTradeTickData(
        userId,
        revengeTradeId,
        triggerTradeId,
        symbol,
        tradeEntryTime,
        tradeExitTime,
        parseInt(windowMinutes)
      );
      
      res.json({
        success: true,
        data: analysis,
        message: 'Tick data analysis generated successfully'
      });
    } catch (error) {
      console.error('Error generating tick data analysis:', error);
      
      if (error.message.includes('No tick data available')) {
        return res.status(404).json({
          error: 'Tick data unavailable',
          message: 'No tick data available for this symbol and date. This might be due to market hours, weekends, or API limitations.'
        });
      }
      
      next(error);
    }
  },

  // Get tick data for a specific symbol and time range
  async getTickData(req, res, next) {
    try {
      const userId = req.user.id;
      const { symbol, datetime } = req.params;
      const { windowMinutes = 30 } = req.query;
      
      // Check if user has access to behavioral analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Tick data access requires Pro tier access',
          upgradeRequired: true
        });
      }

      // Get tick data
      const tickData = await TickDataService.getTicksAroundTime(
        symbol,
        datetime,
        parseInt(windowMinutes)
      );
      
      res.json({
        success: true,
        data: tickData
      });
    } catch (error) {
      console.error('Error getting tick data:', error);
      
      if (error.message.includes('No tick data available')) {
        return res.status(404).json({
          error: 'Tick data unavailable',
          message: 'No tick data available for this symbol and date. This might be due to market hours, weekends, or API limitations.'
        });
      }
      
      next(error);
    }
  },

  // Clear old data and re-run historical analysis with new thresholds
  async reRunHistoricalAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, accounts } = req.query;
      
      // Check if user has access to behavioral analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Historical analysis requires Pro tier access',
          upgradeRequired: true
        });
      }

      // Use the improved V2 version with proper loss thresholds
      const dateFilter = {};
      if (startDate) dateFilter.startDate = startDate;
      if (endDate) dateFilter.endDate = endDate;
      if (accounts) dateFilter.accounts = ensureString(accounts).split(',');

      const analysis = await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2(userId, dateFilter);
      
      res.json({
        success: true,
        data: analysis,
        message: `Historical analysis complete with new thresholds. Analyzed ${analysis.tradesAnalyzed} trades and detected ${analysis.revengeEventsCreated} revenge trading events.`
      });
    } catch (error) {
      console.error('Error re-running historical analysis:', error);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Get trade details for a specific overconfidence event
  async getOverconfidenceEventTrades(req, res, next) {
    try {
      const userId = req.user.id;
      const { eventId } = req.params;
      
      // Get the overconfidence event details
      const eventQuery = `
        SELECT streak_trades
        FROM overconfidence_events
        WHERE id = $1 AND user_id = $2
      `;
      
      const eventResult = await db.query(eventQuery, [eventId, userId]);
      if (eventResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Event not found',
          message: 'Overconfidence event not found'
        });
      }
      
      const streakTrades = eventResult.rows[0].streak_trades;
      if (!streakTrades || streakTrades.length === 0) {
        return res.json({
          success: true,
          data: []
        });
      }
      
      // Get trade details
      const tradesQuery = `
        SELECT 
          id, symbol, entry_time, exit_time, entry_price, exit_price, 
          quantity, side, pnl, commission, fees,
          (quantity * entry_price) as position_size
        FROM trades 
        WHERE id = ANY($1)
        ORDER BY entry_time ASC
      `;
      
      const tradesResult = await db.query(tradesQuery, [streakTrades]);
      
      res.json({
        success: true,
        data: tradesResult.rows
      });
    } catch (error) {
      console.error('Error getting overconfidence event trades:', error);
      next(error);
    }
  },

  // Get overconfidence analysis for a user
  async getOverconfidenceAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, page, limit, accounts } = req.query;

      console.log(`[OVERCONFIDENCE] GET analysis request - userId: ${userId}, startDate: ${startDate}, endDate: ${endDate}, page: ${page}, limit: ${limit}`);

      const dateFilter = {};
      if (startDate) dateFilter.startDate = startDate;
      if (endDate) dateFilter.endDate = endDate;
      if (accounts) dateFilter.accounts = ensureString(accounts).split(',');

      const paginationOptions = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      };

      console.log(`[OVERCONFIDENCE] Calling service.getOverconfidenceAnalysis with dateFilter:`, dateFilter);
      const analysis = await OverconfidenceAnalyticsService.getOverconfidenceAnalysis(userId, dateFilter, paginationOptions);
      console.log(`[OVERCONFIDENCE] Service returned analysis with ${analysis.events?.length || 0} events`);

      // Simply return existing data - don't auto-run analysis
      // Analysis should only be run when explicitly requested via the analyze-historical endpoint
      console.log(`[OVERCONFIDENCE] Returning analysis with ${analysis.events?.length || 0} events`);
      res.json({
        success: true,
        data: {
          analysis: analysis
        }
      });
    } catch (error) {
      console.error(`[OVERCONFIDENCE] Error in getOverconfidenceAnalysis:`, error);
      console.error(`[OVERCONFIDENCE] Error stack:`, error.stack);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      res.status(500).json({
        error: 'Failed to fetch overconfidence analysis',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  },

  // Analyze historical trades for overconfidence patterns
  async analyzeOverconfidenceHistoricalTrades(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, accounts } = req.query;

      console.log(`[OVERCONFIDENCE] Analyzing trades for user ${userId}, date range: ${startDate || 'all'} to ${endDate || 'now'}`);

      // Check if user has access to overconfidence analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'overconfidence_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Overconfidence analysis requires Pro tier access',
          upgradeRequired: true
        });
      }

      const dateFilter = {};
      if (startDate) dateFilter.startDate = startDate;
      if (endDate) dateFilter.endDate = endDate;
      if (accounts) dateFilter.accounts = ensureString(accounts).split(',');

      const analysis = await OverconfidenceAnalyticsService.analyzeHistoricalTrades(userId, dateFilter);

      res.json({
        success: true,
        data: analysis,
        message: `Overconfidence analysis complete. Analyzed ${analysis.tradesAnalyzed} trades and detected ${analysis.overconfidenceEventsCreated} overconfidence events.`
      });
    } catch (error) {
      console.error('[OVERCONFIDENCE] Error analyzing historical trades:', error);
      console.error('[OVERCONFIDENCE] Error stack:', error.stack);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      res.status(500).json({
        error: 'Analysis failed',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  },

  // Regenerate AI recommendations for existing overconfidence events
  async regenerateOverconfidenceAIRecommendations(req, res, next) {
    try {
      const userId = req.user.id;

      console.log(`[OVERCONFIDENCE] Regenerating AI recommendations for user ${userId}`);

      // Check if user has access to overconfidence analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'overconfidence_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Overconfidence analysis requires Pro tier access',
          upgradeRequired: true
        });
      }

      // Clear AI recommendations from all events
      const clearQuery = `
        UPDATE overconfidence_events
        SET ai_recommendations = NULL
        WHERE user_id = $1
        RETURNING id
      `;
      const clearResult = await db.query(clearQuery, [userId]);

      console.log(`[OVERCONFIDENCE] Cleared AI recommendations from ${clearResult.rows.length} events`);

      // Clear the analytics cache so recommendations will be regenerated on next fetch
      const AnalyticsCache = require('../services/analyticsCache');
      await AnalyticsCache.delete(userId); // Delete all cache for this user

      res.json({
        success: true,
        message: `Cleared AI recommendations from ${clearResult.rows.length} events. Recommendations will be regenerated with your current AI provider when you view the analysis.`,
        eventsCleared: clearResult.rows.length
      });
    } catch (error) {
      console.error('[OVERCONFIDENCE] Error regenerating AI recommendations:', error);
      res.status(500).json({
        error: 'Failed to regenerate recommendations',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  },

  // Get overconfidence settings for a user
  async getOverconfidenceSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = await OverconfidenceAnalyticsService.getUserSettings(userId);
      
      // Return default settings if none exist (adjusted for day trading)
      const defaultSettings = {
        detectionEnabled: true,
        minStreakLength: 4, // Higher for day trading context
        positionIncreaseThreshold: 40.0, // Higher threshold for day trading
        sensitivity: 'medium',
        alertPreferences: { email: false, push: true, toast: true }
      };
      
      res.json({
        success: true,
        data: settings || defaultSettings
      });
    } catch (error) {
      next(error);
    }
  },

  // Update overconfidence settings for a user
  async updateOverconfidenceSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = req.body;

      // Validate settings
      if (!behavioralAnalyticsController.validateOverconfidenceSettings(settings)) {
        return res.status(400).json({
          error: 'Invalid settings format',
          message: 'Please provide valid overconfidence settings'
        });
      }

      const updatedSettings = await OverconfidenceAnalyticsService.updateOverconfidenceSettings(userId, settings);
      
      res.json({
        success: true,
        data: updatedSettings,
        message: 'Overconfidence settings updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Validate overconfidence settings format
  validateOverconfidenceSettings(settings) {
    if (!settings || typeof settings !== 'object') return false;
    
    return (
      (settings.detectionEnabled === undefined || typeof settings.detectionEnabled === 'boolean') &&
      (settings.minStreakLength === undefined || (typeof settings.minStreakLength === 'number' && settings.minStreakLength >= 1 && settings.minStreakLength <= 20)) &&
      (settings.positionIncreaseThreshold === undefined || (typeof settings.positionIncreaseThreshold === 'number' && settings.positionIncreaseThreshold >= 0 && settings.positionIncreaseThreshold <= 500)) &&
      (settings.sensitivity === undefined || ['low', 'medium', 'high'].includes(settings.sensitivity)) &&
      (settings.alertPreferences === undefined || typeof settings.alertPreferences === 'object')
    );
  },

  // Real-time overconfidence detection for new trades
  async detectOverconfidenceInRealTime(req, res, next) {
    try {
      const userId = req.user.id;
      const { trade } = req.body;

      if (!trade) {
        return res.status(400).json({
          error: 'Missing trade data',
          message: 'Trade information is required for overconfidence analysis'
        });
      }

      const alert = await OverconfidenceAnalyticsService.detectOverconfidenceInRealTime(userId, trade);
      
      res.json({
        success: true,
        data: alert
      });
    } catch (error) {
      next(error);
    }
  },

  // Get loss aversion analysis
  async getLossAversionAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, accounts } = req.query;

      console.log(`Loss aversion analysis requested for user ${userId}, dates: ${startDate} - ${endDate}`);

      const accountsArray = accounts ? ensureString(accounts).split(',') : undefined;
      const analysis = await LossAversionAnalyticsService.analyzeLossAversion(userId, startDate, endDate, accountsArray);
      
      if (analysis.error) {
        console.log(`Loss aversion analysis returned error: ${analysis.error} - ${analysis.message}`);
        return res.status(400).json({
          error: analysis.error,
          message: analysis.message
        });
      }
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error('Loss aversion analysis error:', error);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      res.status(500).json({
        error: 'Analysis failed',
        message: error.message
      });
    }
  },

  // Get historical loss aversion trends
  async getLossAversionTrends(req, res, next) {
    try {
      const userId = req.user.id;
      const { limit = 12 } = req.query;
      
      const trends = await LossAversionAnalyticsService.getHistoricalTrends(userId, parseInt(limit));
      
      res.json({
        success: true,
        data: trends
      });
    } catch (error) {
      next(error);
    }
  },

  // Get latest loss aversion metrics
  async getLatestLossAversionMetrics(req, res, next) {
    try {
      const userId = req.user.id;
      
      const metrics = await LossAversionAnalyticsService.getLatestMetrics(userId);
      
      if (!metrics) {
        return res.json({
          success: true,
          data: null,
          message: 'No loss aversion analysis available. Run analysis first.'
        });
      }
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      next(error);
    }
  },

  // Get complete loss aversion analysis (with stored trade patterns)
  async getCompleteLossAversionAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      
      const analysis = await LossAversionAnalyticsService.getCompleteAnalysis(userId);
      
      if (!analysis) {
        return res.json({
          success: true,
          data: null,
          message: 'No loss aversion analysis available. Run analysis first.'
        });
      }
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      next(error);
    }
  },

  // Get top missed trades by percentage of missed opportunity
  async getTopMissedTrades(req, res, next) {
    try {
      const userId = req.user.id;
      const { limit = 20, startDate, endDate, forceRefresh, accounts } = req.query;

      const shouldForceRefresh = forceRefresh === 'true' || forceRefresh === true;
      const accountsArray = accounts ? ensureString(accounts).split(',') : undefined;

      console.log(`Top missed trades requested for user ${userId}, limit: ${limit}, dateRange: ${startDate} to ${endDate}, forceRefresh: ${shouldForceRefresh}`);

      const analysis = await LossAversionAnalyticsService.getTopMissedTrades(
        userId,
        parseInt(limit),
        startDate,
        endDate,
        shouldForceRefresh,
        accountsArray
      );

      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error('Top missed trades analysis error:', error);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      res.status(500).json({
        error: 'Analysis failed',
        message: error.message
      });
    }
  },

  // Get trading personality analysis
  async getPersonalityAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, accounts } = req.query;

      console.log(`Personality analysis requested for user ${userId}, dates: ${startDate} - ${endDate}`);

      const accountsArray = accounts ? ensureString(accounts).split(',') : undefined;
      const analysis = await TradingPersonalityService.analyzePersonality(userId, startDate, endDate, accountsArray);
      
      if (analysis.error) {
        console.log(`Personality analysis returned error: ${analysis.error} - ${analysis.message}`);
        return res.status(400).json({
          error: analysis.error,
          message: analysis.message
        });
      }
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error('Trading personality analysis error:', error);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      res.status(500).json({
        error: 'Analysis failed',
        message: error.message
      });
    }
  },

  // Get latest personality profile (with complete analysis data)
  async getLatestPersonalityProfile(req, res, next) {
    try {
      const userId = req.user.id;
      
      const analysis = await TradingPersonalityService.getCompleteAnalysis(userId);
      
      if (!analysis) {
        return res.json({
          success: true,
          data: null,
          message: 'No personality analysis available. Run analysis first.'
        });
      }
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      next(error);
    }
  },

  // Get personality drift analysis
  async getPersonalityDrift(req, res, next) {
    try {
      const userId = req.user.id;
      
      const driftAnalysis = await TradingPersonalityService.analyzeBehavioralDrift(userId);
      
      res.json({
        success: true,
        data: driftAnalysis
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = behavioralAnalyticsController;
