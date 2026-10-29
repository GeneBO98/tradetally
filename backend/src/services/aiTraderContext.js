const db = require('../config/database');
const { fxUsd } = require('../utils/tradeFx');
const AICurrency = require('./aiCurrency');

/**
 * AI Trader Context ("trader dossier")
 *
 * One place that assembles everything TradeTally knows about the trader that
 * is NOT raw activity: the declared profile, what their trades reveal, known
 * behavioral tendencies, personality drift, the latest Edge Report, playbook
 * rules and adherence, risk limits, watchlists, and holdings. Every AI prompt
 * (chat, analysis sessions, recommendations, journal analysis, Edge Report
 * narrative, weekly recap, dashboard insights) renders the same dossier so
 * the model's picture of the trader is consistent across features.
 *
 * Sections are loaded independently and omitted when empty or failing, so a
 * fresh install with no behavioral data still gets a valid dossier.
 */
class AITraderContext {
  static CACHE_TTL_MS = 2 * 60 * 1000;
  static BEHAVIOR_WINDOW_DAYS = 90;
  static OBSERVED_WINDOW_DAYS = 180;
  static MAX_WATCHLIST_SYMBOLS = 40;
  static MAX_HOLDINGS = 15;
  static MAX_PLAYBOOKS = 8;
  static MAX_MEMORY_NOTES = 20;
  static MAX_MEMORY_NOTE_CHARS = 300;
  static MAX_ABOUT_CHARS = 2000;

  static ALL_SECTIONS = [
    'profile', 'observed', 'behavior', 'personality', 'edge',
    'playbooks', 'risk', 'watchlist', 'holdings'
  ];

  // userId -> { expiresAt, dossier }
  static cache = new Map();

  static invalidate(userId) {
    if (userId) this.cache.delete(String(userId));
    else this.cache.clear();
  }

  static toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  static percent(value, digits = 0) {
    const number = this.toNumber(value);
    return number === null ? 'N/A' : `${number.toFixed(digits)}%`;
  }

  static isoDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  }

  static list(values) {
    return Array.isArray(values) && values.length ? values.join(', ') : null;
  }

  static clean(text, maxLength) {
    if (!text) return '';
    const value = String(text).replace(/\s+/g, ' ').trim();
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }

  static async settle(label, promise, fallback = null) {
    try {
      return await promise;
    } catch (error) {
      console.warn(`[AI_DOSSIER] Could not load ${label}: ${error.message}`);
      return fallback;
    }
  }

  // ---------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------

  /** Declared profile from user settings, including free text and memory notes. */
  static async loadProfile(userId) {
    const result = await db.query(
      `SELECT trading_strategies, trading_styles, risk_tolerance, experience_level,
              average_position_size, primary_markets, trading_goals, preferred_sectors,
              about_trading, ai_memory_notes,
              default_stop_loss_type, default_stop_loss_percent, default_stop_loss_dollars,
              default_stop_loss_points
       FROM user_settings WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const notes = Array.isArray(row.ai_memory_notes) ? row.ai_memory_notes : [];
    return {
      trading_strategies: row.trading_strategies || [],
      trading_styles: row.trading_styles || [],
      risk_tolerance: row.risk_tolerance || null,
      experience_level: row.experience_level || null,
      average_position_size: row.average_position_size || null,
      primary_markets: row.primary_markets || [],
      trading_goals: row.trading_goals || [],
      preferred_sectors: row.preferred_sectors || [],
      about_trading: this.clean(row.about_trading, this.MAX_ABOUT_CHARS) || null,
      ai_memory_notes: notes
        .filter(note => typeof note === 'string' && note.trim())
        .slice(0, this.MAX_MEMORY_NOTES)
        .map(note => this.clean(note, this.MAX_MEMORY_NOTE_CHARS)),
      default_stop: row.default_stop_loss_type ? {
        type: row.default_stop_loss_type,
        percent: this.toNumber(row.default_stop_loss_percent),
        dollars: this.toNumber(row.default_stop_loss_dollars),
        points: this.toNumber(row.default_stop_loss_points)
      } : null
    };
  }

  /**
   * What the trades say: hold time, cadence, sizing, stop usage, grades, R.
   * Closed trades in the last OBSERVED_WINDOW_DAYS, in the user's timezone
   * for the active-hours bucket.
   */
  static async loadObserved(userId) {
    const result = await db.query(
      `WITH recent AS (
         SELECT t.*, COALESCE(u.timezone, 'UTC') AS tz
         FROM trades t
         JOIN users u ON u.id = t.user_id
         WHERE t.user_id = $1
           AND t.exit_price IS NOT NULL
           AND t.entry_time >= NOW() - ($2 * INTERVAL '1 day')
       ),
       hours AS (
         SELECT EXTRACT(HOUR FROM (entry_time AT TIME ZONE tz))::int AS hour, COUNT(*)::int AS n
         FROM recent
         WHERE entry_time IS NOT NULL
         GROUP BY 1 ORDER BY 2 DESC LIMIT 3
       ),
       grades AS (
         SELECT quality_grade, COUNT(*)::int AS n
         FROM recent WHERE quality_grade IS NOT NULL AND quality_grade <> ''
         GROUP BY 1
       ),
       instruments AS (
         SELECT COALESCE(instrument_type, 'stock') AS instrument_type, COUNT(*)::int AS n
         FROM recent GROUP BY 1 ORDER BY 2 DESC LIMIT 1
       )
       SELECT
         (SELECT COUNT(*)::int FROM recent) AS trades,
         (SELECT MIN(entry_time) FROM recent) AS first_trade,
         (SELECT MAX(COALESCE(exit_time, entry_time)) FROM recent) AS last_trade,
         (SELECT COUNT(DISTINCT (entry_time AT TIME ZONE tz)::date)::int FROM recent) AS trading_days,
         (SELECT AVG(EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60.0)
            FROM recent WHERE exit_time IS NOT NULL AND exit_time > entry_time) AS avg_hold_minutes,
         (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60.0)
            FROM recent WHERE exit_time IS NOT NULL AND exit_time > entry_time) AS median_hold_minutes,
         (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${fxUsd('entry_price', '')} * quantity)
            FROM recent WHERE COALESCE(instrument_type, 'stock') IN ('stock', 'crypto', 'etf')
              AND entry_price IS NOT NULL AND quantity IS NOT NULL) AS median_notional_usd,
         (SELECT AVG(CASE WHEN stop_loss IS NOT NULL THEN 100.0 ELSE 0 END) FROM recent) AS stop_usage_pct,
         (SELECT AVG(r_value) FROM recent WHERE r_value IS NOT NULL) AS avg_r,
         (SELECT COUNT(*)::int FROM recent WHERE r_value IS NOT NULL) AS r_trades,
         (SELECT AVG(CASE WHEN side = 'long' THEN 100.0 ELSE 0 END) FROM recent) AS long_pct,
         (SELECT instrument_type FROM instruments) AS dominant_instrument,
         (SELECT json_agg(json_build_object('hour', hour, 'n', n)) FROM hours) AS active_hours,
         (SELECT json_object_agg(quality_grade, n) FROM grades) AS grade_counts,
         (SELECT COALESCE(u.timezone, 'UTC') FROM users u WHERE u.id = $1) AS timezone`,
      [userId, this.OBSERVED_WINDOW_DAYS]
    );
    const row = result.rows[0];
    if (!row || !row.trades) return null;

    const spanDays = row.first_trade && row.last_trade
      ? Math.max(1, (new Date(row.last_trade) - new Date(row.first_trade)) / (24 * 60 * 60 * 1000))
      : null;

    return {
      window_days: this.OBSERVED_WINDOW_DAYS,
      trades: row.trades,
      trading_days: row.trading_days,
      trades_per_week: spanDays ? Number((row.trades / (spanDays / 7)).toFixed(1)) : null,
      avg_hold_minutes: this.toNumber(row.avg_hold_minutes),
      median_hold_minutes: this.toNumber(row.median_hold_minutes),
      median_notional_usd: this.toNumber(row.median_notional_usd),
      stop_usage_pct: this.toNumber(row.stop_usage_pct),
      avg_r: this.toNumber(row.avg_r),
      r_trades: row.r_trades,
      long_pct: this.toNumber(row.long_pct),
      dominant_instrument: row.dominant_instrument || null,
      active_hours: Array.isArray(row.active_hours) ? row.active_hours : [],
      grade_counts: row.grade_counts || {},
      timezone: row.timezone || 'UTC'
    };
  }

  /** Behavioral tendencies detected in the last BEHAVIOR_WINDOW_DAYS. */
  static async loadBehavior(userId) {
    const windowDays = this.BEHAVIOR_WINDOW_DAYS;
    const [patterns, revenge, overconfidence, streaks] = await Promise.all([
      db.query(
        `SELECT pattern_type, COUNT(*)::int AS occurrences,
                COUNT(*) FILTER (WHERE severity = 'high')::int AS high_severity,
                MAX(detected_at) AS last_detected
         FROM behavioral_patterns
         WHERE user_id = $1 AND detected_at >= NOW() - ($2 * INTERVAL '1 day')
         GROUP BY pattern_type ORDER BY occurrences DESC LIMIT 8`,
        [userId, windowDays]
      ),
      db.query(
        `SELECT COUNT(*)::int AS events,
                AVG(trigger_loss_amount) AS avg_trigger_loss,
                SUM(total_additional_loss) AS total_additional_loss,
                AVG(position_size_increase_percent) AS avg_size_increase_pct,
                AVG(time_window_minutes) AS avg_window_minutes,
                MAX(trigger_timestamp) AS last_event
         FROM revenge_trading_events
         WHERE user_id = $1 AND trigger_timestamp >= NOW() - ($2 * INTERVAL '1 day')`,
        [userId, windowDays]
      ),
      db.query(
        `SELECT COUNT(*)::int AS events,
                AVG(win_streak_length) AS avg_streak_length,
                AVG(position_size_increase_percent) AS avg_size_increase_pct,
                COUNT(*) FILTER (WHERE outcome_after_streak = 'loss')::int AS ended_in_loss,
                MAX(win_streak_end_date) AS last_event
         FROM overconfidence_events
         WHERE user_id = $1 AND COALESCE(win_streak_end_date, created_at) >= NOW() - ($2 * INTERVAL '1 day')`,
        [userId, windowDays]
      ),
      db.query(
        `SELECT streak_type, current_length, total_pnl, last_trade_date
         FROM win_loss_streaks
         WHERE user_id = $1 AND is_active = true
         ORDER BY updated_at DESC LIMIT 1`,
        [userId]
      )
    ]);

    const revengeRow = revenge.rows[0] || {};
    const overRow = overconfidence.rows[0] || {};
    const streak = streaks.rows[0] || null;
    const hasData = patterns.rows.length > 0 || revengeRow.events > 0 || overRow.events > 0 || streak;
    if (!hasData) return null;

    return {
      window_days: windowDays,
      patterns: patterns.rows.map(row => ({
        type: row.pattern_type,
        occurrences: row.occurrences,
        high_severity: row.high_severity,
        last_detected: this.isoDate(row.last_detected)
      })),
      revenge: revengeRow.events > 0 ? {
        events: revengeRow.events,
        avg_trigger_loss_usd: this.toNumber(revengeRow.avg_trigger_loss),
        total_additional_loss_usd: this.toNumber(revengeRow.total_additional_loss),
        avg_size_increase_pct: this.toNumber(revengeRow.avg_size_increase_pct),
        avg_window_minutes: this.toNumber(revengeRow.avg_window_minutes),
        last_event: this.isoDate(revengeRow.last_event)
      } : null,
      overconfidence: overRow.events > 0 ? {
        events: overRow.events,
        avg_streak_length: this.toNumber(overRow.avg_streak_length),
        avg_size_increase_pct: this.toNumber(overRow.avg_size_increase_pct),
        ended_in_loss: overRow.ended_in_loss,
        last_event: this.isoDate(overRow.last_event)
      } : null,
      active_streak: streak ? {
        type: streak.streak_type,
        length: streak.current_length,
        total_pnl_usd: this.toNumber(streak.total_pnl),
        last_trade_date: this.isoDate(streak.last_trade_date)
      } : null
    };
  }

  /** Latest computed personality profile and drift reading. */
  static async loadPersonality(userId) {
    const [profile, drift] = await Promise.all([
      db.query(
        `SELECT primary_personality, personality_confidence, avg_hold_time_minutes,
                avg_trade_frequency_per_day, risk_tolerance, position_sizing_consistency,
                stop_loss_discipline, optimal_strategy_adherence, total_trades_analyzed,
                analysis_end_date
         FROM trading_personality_profiles
         WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [userId]
      ),
      db.query(
        `SELECT analysis_date, previous_primary_personality, current_primary_personality,
                drift_severity, hold_time_drift_percent, frequency_drift_percent,
                risk_tolerance_drift, drift_performance_impact
         FROM personality_drift_tracking
         WHERE user_id = $1 ORDER BY analysis_date DESC LIMIT 1`,
        [userId]
      )
    ]);
    const row = profile.rows[0];
    const driftRow = drift.rows[0];
    if (!row && !driftRow) return null;
    return {
      primary: row?.primary_personality || null,
      confidence: this.toNumber(row?.personality_confidence),
      avg_hold_minutes: this.toNumber(row?.avg_hold_time_minutes),
      trades_per_day: this.toNumber(row?.avg_trade_frequency_per_day),
      observed_risk_tolerance: row?.risk_tolerance || null,
      sizing_consistency: this.toNumber(row?.position_sizing_consistency),
      stop_discipline: this.toNumber(row?.stop_loss_discipline),
      strategy_adherence: this.toNumber(row?.optimal_strategy_adherence),
      trades_analyzed: row?.total_trades_analyzed || null,
      as_of: this.isoDate(row?.analysis_end_date),
      drift: driftRow ? {
        date: this.isoDate(driftRow.analysis_date),
        from: driftRow.previous_primary_personality,
        to: driftRow.current_primary_personality,
        severity: driftRow.drift_severity,
        hold_time_pct: this.toNumber(driftRow.hold_time_drift_percent),
        frequency_pct: this.toNumber(driftRow.frequency_drift_percent),
        performance_impact: this.toNumber(driftRow.drift_performance_impact)
      } : null
    };
  }

  /** Most recent weekly Edge Report. */
  static async loadEdge(userId) {
    const result = await db.query(
      `SELECT period_start, period_end, report
       FROM edge_reports WHERE user_id = $1
       ORDER BY period_end DESC LIMIT 1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row || !row.report) return null;
    const report = typeof row.report === 'string' ? JSON.parse(row.report) : row.report;
    return {
      period_start: this.isoDate(row.period_start),
      period_end: this.isoDate(row.period_end),
      week: report.week || null,
      edge: report.edge || null,
      leak: report.leak || null,
      action_item: report.action_item || null
    };
  }

  /** Active playbooks (the trader's written rules) and adherence to them. */
  static async loadPlaybooks(userId) {
    const [playbooks, adherence] = await Promise.all([
      db.query(
        `SELECT p.name, p.description, p.market, p.timeframe, p.side, p.required_strategy,
                p.required_setup, p.required_tags, p.require_stop_loss, p.minimum_target_r,
                (SELECT COUNT(*)::int FROM playbook_checklist_items c WHERE c.playbook_id = p.id) AS checklist_items,
                (SELECT COUNT(*)::int FROM trade_playbook_reviews r WHERE r.playbook_id = p.id) AS reviews,
                (SELECT AVG(r.adherence_score) FROM trade_playbook_reviews r WHERE r.playbook_id = p.id) AS avg_adherence
         FROM playbooks p
         WHERE p.user_id = $1 AND p.is_active = true
         ORDER BY reviews DESC, p.created_at ASC
         LIMIT $2`,
        [userId, this.MAX_PLAYBOOKS]
      ),
      db.query(
        `SELECT COUNT(*)::int AS reviews,
                AVG(adherence_score) AS avg_adherence,
                AVG(CASE WHEN followed_plan THEN 100.0 ELSE 0 END) AS followed_plan_pct
         FROM trade_playbook_reviews
         WHERE user_id = $1 AND reviewed_at >= NOW() - ($2 * INTERVAL '1 day')`,
        [userId, this.BEHAVIOR_WINDOW_DAYS]
      )
    ]);
    if (playbooks.rows.length === 0) return null;
    const adh = adherence.rows[0] || {};
    return {
      playbooks: playbooks.rows.map(row => ({
        name: row.name,
        description: this.clean(row.description, 200) || null,
        market: row.market, timeframe: row.timeframe, side: row.side,
        required_strategy: row.required_strategy, required_setup: row.required_setup,
        required_tags: row.required_tags || [],
        require_stop_loss: row.require_stop_loss === true,
        minimum_target_r: this.toNumber(row.minimum_target_r),
        checklist_items: row.checklist_items,
        reviews: row.reviews,
        avg_adherence: this.toNumber(row.avg_adherence)
      })),
      recent: adh.reviews > 0 ? {
        window_days: this.BEHAVIOR_WINDOW_DAYS,
        reviews: adh.reviews,
        avg_adherence: this.toNumber(adh.avg_adherence),
        followed_plan_pct: this.toNumber(adh.followed_plan_pct)
      } : null
    };
  }

  /** Account-level risk limits (prop-firm style rules). */
  static async loadRisk(userId) {
    const result = await db.query(
      `SELECT label, account_identifier, account_size, max_daily_loss, max_drawdown,
              drawdown_mode, profit_target
       FROM account_rule_profiles
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at ASC LIMIT 6`,
      [userId]
    );
    if (result.rows.length === 0) return null;
    return result.rows.map(row => ({
      label: row.label || row.account_identifier,
      account_size: this.toNumber(row.account_size),
      max_daily_loss: this.toNumber(row.max_daily_loss),
      max_drawdown: this.toNumber(row.max_drawdown),
      drawdown_mode: row.drawdown_mode,
      profit_target: this.toNumber(row.profit_target)
    }));
  }

  static async loadWatchlist(userId) {
    const result = await db.query(
      `SELECT w.name, UPPER(i.symbol) AS symbol, i.notes
       FROM watchlist_items i
       JOIN watchlists w ON w.id = i.watchlist_id
       WHERE w.user_id = $1
       ORDER BY w.is_default DESC, i.added_at DESC
       LIMIT $2`,
      [userId, this.MAX_WATCHLIST_SYMBOLS]
    );
    if (result.rows.length === 0) return null;
    const byList = new Map();
    for (const row of result.rows) {
      if (!byList.has(row.name)) byList.set(row.name, []);
      byList.get(row.name).push(row.symbol);
    }
    return [...byList.entries()].map(([name, symbols]) => ({ name, symbols: [...new Set(symbols)] }));
  }

  static async loadHoldings(userId) {
    const result = await db.query(
      `SELECT symbol, total_shares, average_cost_basis, current_value, unrealized_pnl_percent,
              target_allocation_percent, sector
       FROM investment_holdings
       WHERE user_id = $1 AND COALESCE(total_shares, 0) > 0
       ORDER BY current_value DESC NULLS LAST
       LIMIT $2`,
      [userId, this.MAX_HOLDINGS]
    );
    if (result.rows.length === 0) return null;
    return result.rows.map(row => ({
      symbol: row.symbol,
      shares: this.toNumber(row.total_shares),
      avg_cost: this.toNumber(row.average_cost_basis),
      value: this.toNumber(row.current_value),
      unrealized_pct: this.toNumber(row.unrealized_pnl_percent),
      target_pct: this.toNumber(row.target_allocation_percent),
      sector: row.sector || null
    }));
  }

  // ---------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------

  /**
   * Assemble the dossier. Cached per user for CACHE_TTL_MS because the chat
   * rebuilds its prompt on every message.
   * @param {string} userId
   * @param {Object} options
   * @param {string[]} options.sections - subset of ALL_SECTIONS (default all)
   * @param {boolean} options.force - bypass the cache
   */
  static async build(userId, { sections = this.ALL_SECTIONS, force = false } = {}) {
    const key = String(userId);
    const now = Date.now();
    const cached = this.cache.get(key);
    let dossier = cached && cached.expiresAt > now && !force ? cached.dossier : null;

    if (!dossier) {
      const loaders = {
        profile: () => this.loadProfile(userId),
        observed: () => this.loadObserved(userId),
        behavior: () => this.loadBehavior(userId),
        personality: () => this.loadPersonality(userId),
        edge: () => this.loadEdge(userId),
        playbooks: () => this.loadPlaybooks(userId),
        risk: () => this.loadRisk(userId),
        watchlist: () => this.loadWatchlist(userId),
        holdings: () => this.loadHoldings(userId)
      };
      const names = Object.keys(loaders);
      const values = await Promise.all(names.map(name => this.settle(name, loaders[name](), null)));
      dossier = { generated_at: new Date(now).toISOString() };
      names.forEach((name, index) => { dossier[name] = values[index]; });
      this.cache.set(key, { expiresAt: now + this.CACHE_TTL_MS, dossier });
    }

    const wanted = new Set(sections);
    const out = { generated_at: dossier.generated_at };
    for (const name of this.ALL_SECTIONS) {
      out[name] = wanted.has(name) ? dossier[name] : null;
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------

  static formatHour(hour) {
    const h = ((hour % 24) + 24) % 24;
    const suffix = h >= 12 ? 'pm' : 'am';
    const base = h % 12 === 0 ? 12 : h % 12;
    return `${base}${suffix}`;
  }

  static formatMinutes(minutes) {
    const m = this.toNumber(minutes);
    if (m === null) return 'N/A';
    if (m < 60) return `${Math.round(m)} min`;
    if (m < 60 * 24) return `${(m / 60).toFixed(1)} h`;
    return `${(m / (60 * 24)).toFixed(1)} days`;
  }

  static formatProfile(profile, lines) {
    if (!profile) return;
    lines.push('DECLARED PROFILE (from the trader\'s settings):');
    lines.push(`- Strategies: ${this.list(profile.trading_strategies) || 'Not specified'}`);
    lines.push(`- Styles: ${this.list(profile.trading_styles) || 'Not specified'}`);
    lines.push(`- Risk tolerance: ${profile.risk_tolerance || 'Not specified'}; experience: ${profile.experience_level || 'Not specified'}; typical position size: ${profile.average_position_size || 'Not specified'}`);
    lines.push(`- Markets: ${this.list(profile.primary_markets) || 'Not specified'}; preferred sectors: ${this.list(profile.preferred_sectors) || 'Not specified'}`);
    lines.push(`- Goals: ${this.list(profile.trading_goals) || 'Not specified'}`);
    if (profile.default_stop) {
      const stop = profile.default_stop;
      const detail = stop.type === 'percent' && stop.percent !== null ? `${stop.percent}%`
        : stop.type === 'dollars' && stop.dollars !== null ? `$${stop.dollars}`
        : stop.type === 'points' && stop.points !== null ? `${stop.points} points`
        : null;
      if (detail) lines.push(`- Default stop loss: ${detail}`);
    }
    if (profile.about_trading) {
      lines.push(`- In their own words: "${profile.about_trading}"`);
    }
    if (profile.ai_memory_notes?.length) {
      lines.push('- Things the trader asked you to remember:');
      profile.ai_memory_notes.forEach(note => lines.push(`  - ${note}`));
    }
    lines.push('');
  }

  static formatObserved(observed, lines, currency) {
    if (!observed) return;
    const money = value => currency.format(currency.fromUsd(value));
    lines.push(`OBSERVED FROM THEIR TRADES (last ${observed.window_days} days, ${observed.trades} closed trades over ${observed.trading_days} trading days):`);
    const cadence = [
      observed.trades_per_week !== null ? `about ${observed.trades_per_week} trades/week` : null,
      observed.median_hold_minutes !== null ? `median hold ${this.formatMinutes(observed.median_hold_minutes)}` : null,
      observed.avg_hold_minutes !== null ? `average hold ${this.formatMinutes(observed.avg_hold_minutes)}` : null
    ].filter(Boolean).join(', ');
    if (cadence) lines.push(`- Cadence: ${cadence}`);
    const mix = [
      observed.dominant_instrument ? `mostly ${observed.dominant_instrument}` : null,
      observed.long_pct !== null ? `${Math.round(observed.long_pct)}% long` : null,
      observed.median_notional_usd !== null ? `median position about ${money(observed.median_notional_usd)}` : null
    ].filter(Boolean).join(', ');
    if (mix) lines.push(`- Mix: ${mix}`);
    if (observed.active_hours?.length) {
      const hours = observed.active_hours.map(h => `${this.formatHour(h.hour)} (${h.n})`).join(', ');
      lines.push(`- Most active entry hours (${observed.timezone}): ${hours}`);
    }
    const discipline = [
      observed.stop_usage_pct !== null ? `stop recorded on ${Math.round(observed.stop_usage_pct)}% of trades` : null,
      observed.avg_r !== null && observed.r_trades ? `average ${observed.avg_r.toFixed(2)}R across ${observed.r_trades} trades with R data` : null
    ].filter(Boolean).join('; ');
    if (discipline) lines.push(`- Discipline: ${discipline}`);
    const grades = Object.entries(observed.grade_counts || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([grade, n]) => `${grade}: ${n}`)
      .join(', ');
    if (grades) lines.push(`- Setup quality grades: ${grades}`);
    lines.push('');
  }

  static formatBehavior(behavior, lines, currency) {
    if (!behavior) return;
    const money = value => currency.format(currency.fromUsd(value));
    lines.push(`KNOWN TENDENCIES (detected by TradeTally in the last ${behavior.window_days} days):`);
    if (behavior.revenge) {
      const r = behavior.revenge;
      const parts = [
        `${r.events} revenge-trading episode${r.events === 1 ? '' : 's'}`,
        r.avg_trigger_loss_usd !== null ? `typically after a loss around ${money(Math.abs(r.avg_trigger_loss_usd))}` : null,
        r.avg_size_increase_pct !== null ? `size up about ${Math.round(r.avg_size_increase_pct)}% on the re-entry` : null,
        r.total_additional_loss_usd !== null ? `net ${money(r.total_additional_loss_usd)} on the follow-up trades` : null,
        r.last_event ? `last on ${r.last_event}` : null
      ].filter(Boolean).join(', ');
      lines.push(`- Revenge trading: ${parts}`);
    }
    if (behavior.overconfidence) {
      const o = behavior.overconfidence;
      const parts = [
        `${o.events} overconfidence episode${o.events === 1 ? '' : 's'}`,
        o.avg_streak_length !== null ? `after win streaks of about ${Math.round(o.avg_streak_length)}` : null,
        o.avg_size_increase_pct !== null ? `size up about ${Math.round(o.avg_size_increase_pct)}%` : null,
        o.ended_in_loss ? `${o.ended_in_loss} ended in a loss` : null,
        o.last_event ? `last on ${o.last_event}` : null
      ].filter(Boolean).join(', ');
      lines.push(`- Overconfidence after wins: ${parts}`);
    }
    const otherPatterns = behavior.patterns.filter(p => !/revenge|overconfiden/i.test(p.type));
    otherPatterns.forEach(p => {
      lines.push(`- ${p.type.replace(/_/g, ' ')}: ${p.occurrences} occurrence${p.occurrences === 1 ? '' : 's'}${p.high_severity ? ` (${p.high_severity} high severity)` : ''}${p.last_detected ? `, last ${p.last_detected}` : ''}`);
    });
    if (behavior.active_streak) {
      const s = behavior.active_streak;
      lines.push(`- Current streak: ${s.length} ${s.type === 'win' ? 'wins' : s.type === 'loss' ? 'losses' : s.type} in a row${s.total_pnl_usd !== null ? ` (${money(s.total_pnl_usd)})` : ''}${s.last_trade_date ? `, last trade ${s.last_trade_date}` : ''}`);
    }
    lines.push('');
  }

  static formatPersonality(personality, lines) {
    if (!personality) return;
    lines.push('TRADING PERSONALITY (computed from behavior):');
    if (personality.primary) {
      const parts = [
        `${personality.primary}${personality.confidence !== null ? ` (${Math.round(personality.confidence)}% confidence)` : ''}`,
        personality.avg_hold_minutes !== null ? `avg hold ${this.formatMinutes(personality.avg_hold_minutes)}` : null,
        personality.trades_per_day !== null ? `${personality.trades_per_day.toFixed(1)} trades/day` : null,
        personality.observed_risk_tolerance ? `observed risk tolerance ${personality.observed_risk_tolerance}` : null
      ].filter(Boolean).join(', ');
      lines.push(`- Primary: ${parts}`);
      const scores = [
        personality.stop_discipline !== null ? `stop-loss discipline ${Math.round(personality.stop_discipline)}/100` : null,
        personality.sizing_consistency !== null ? `sizing consistency ${Math.round(personality.sizing_consistency)}/100` : null,
        personality.strategy_adherence !== null ? `strategy adherence ${Math.round(personality.strategy_adherence)}/100` : null
      ].filter(Boolean).join(', ');
      if (scores) lines.push(`- Scores: ${scores}`);
    }
    if (personality.drift) {
      const d = personality.drift;
      const change = d.from && d.to && d.from !== d.to ? `shifted from ${d.from} to ${d.to}` : 'no personality change';
      const details = [
        d.hold_time_pct !== null ? `hold time ${d.hold_time_pct >= 0 ? '+' : ''}${Math.round(d.hold_time_pct)}%` : null,
        d.frequency_pct !== null ? `frequency ${d.frequency_pct >= 0 ? '+' : ''}${Math.round(d.frequency_pct)}%` : null,
        d.performance_impact !== null ? `performance impact ${d.performance_impact >= 0 ? '+' : ''}${d.performance_impact.toFixed(1)}` : null
      ].filter(Boolean).join(', ');
      lines.push(`- Drift (${d.date || 'latest'}): ${d.severity || 'unknown'} severity, ${change}${details ? `; ${details}` : ''}`);
    }
    lines.push('');
  }

  static formatEdge(edge, lines, currency) {
    if (!edge) return;
    const money = value => currency.format(currency.fromUsd(value));
    lines.push(`LATEST EDGE REPORT (week ${edge.period_start} to ${edge.period_end}):`);
    if (edge.week) {
      const w = edge.week;
      lines.push(`- Week: ${w.total_trades ?? 'N/A'} trades, P&L ${w.total_pnl !== undefined ? money(w.total_pnl) : 'N/A'}, win rate ${this.percent(w.win_rate, 1)}, profit factor ${this.toNumber(w.profit_factor)?.toFixed(2) ?? 'N/A'}`);
    }
    if (edge.edge) {
      lines.push(`- Edge: ${edge.edge.name}${edge.edge.type ? ` (${edge.edge.type})` : ''}: ${edge.edge.trades ?? '?'} trades, ${edge.edge.total_pnl !== undefined ? money(edge.edge.total_pnl) : 'N/A'}, win rate ${this.percent(edge.edge.win_rate, 1)}`);
    }
    if (edge.leak) {
      lines.push(`- Leak: ${edge.leak.description || edge.leak.name || JSON.stringify(edge.leak)}`);
    }
    if (edge.action_item) {
      lines.push(`- Action item they were given: ${typeof edge.action_item === 'string' ? edge.action_item : (edge.action_item.text || edge.action_item.description || JSON.stringify(edge.action_item))}`);
    }
    lines.push('');
  }

  static formatPlaybooks(playbooks, lines) {
    if (!playbooks) return;
    lines.push('PLAYBOOKS (the trader\'s own written rules):');
    playbooks.playbooks.forEach(p => {
      const rules = [
        p.required_strategy ? `strategy ${p.required_strategy}` : null,
        p.required_setup ? `setup ${p.required_setup}` : null,
        p.market ? `market ${p.market}` : null,
        p.timeframe ? `timeframe ${p.timeframe}` : null,
        p.side ? `side ${p.side}` : null,
        p.require_stop_loss ? 'stop required' : null,
        p.minimum_target_r !== null ? `min target ${p.minimum_target_r}R` : null,
        p.required_tags?.length ? `tags ${p.required_tags.join('/')}` : null,
        p.checklist_items ? `${p.checklist_items}-item checklist` : null
      ].filter(Boolean).join(', ');
      const adherence = p.reviews ? `; ${p.reviews} reviewed trades, avg adherence ${Math.round(p.avg_adherence ?? 0)}%` : '';
      lines.push(`- ${p.name}${p.description ? ` - ${p.description}` : ''}${rules ? ` [${rules}]` : ''}${adherence}`);
    });
    if (playbooks.recent) {
      const r = playbooks.recent;
      lines.push(`- Last ${r.window_days} days: ${r.reviews} playbook reviews, avg adherence ${Math.round(r.avg_adherence ?? 0)}%, followed plan on ${Math.round(r.followed_plan_pct ?? 0)}%`);
    }
    lines.push('');
  }

  static formatRisk(risk, lines, currency) {
    if (!risk) return;
    const money = value => currency.format(currency.fromUsd(value));
    lines.push('ACCOUNT RISK LIMITS (rules the trader set):');
    risk.forEach(r => {
      const parts = [
        r.account_size !== null ? `size ${money(r.account_size)}` : null,
        r.max_daily_loss !== null ? `max daily loss ${money(r.max_daily_loss)}` : null,
        r.max_drawdown !== null ? `max drawdown ${money(r.max_drawdown)}${r.drawdown_mode ? ` (${r.drawdown_mode})` : ''}` : null,
        r.profit_target !== null ? `profit target ${money(r.profit_target)}` : null
      ].filter(Boolean).join(', ');
      lines.push(`- ${r.label}: ${parts || 'no limits set'}`);
    });
    lines.push('');
  }

  static formatWatchlist(watchlist, lines) {
    if (!watchlist) return;
    lines.push('WATCHLISTS:');
    watchlist.forEach(w => lines.push(`- ${w.name}: ${w.symbols.join(', ')}`));
    lines.push('');
  }

  static formatHoldings(holdings, lines, currency) {
    if (!holdings) return;
    const money = value => currency.format(currency.fromUsd(value));
    lines.push('INVESTMENT HOLDINGS (long-term portfolio, largest first):');
    holdings.forEach(h => {
      const parts = [
        h.shares !== null ? `${h.shares} shares` : null,
        h.avg_cost !== null ? `avg cost ${money(h.avg_cost)}` : null,
        h.value !== null ? `value ${money(h.value)}` : null,
        h.unrealized_pct !== null ? `${h.unrealized_pct >= 0 ? '+' : ''}${h.unrealized_pct.toFixed(1)}% unrealized` : null,
        h.target_pct !== null ? `target ${h.target_pct}%` : null,
        h.sector ? h.sector : null
      ].filter(Boolean).join(', ');
      lines.push(`- ${h.symbol}: ${parts}`);
    });
    lines.push('');
  }

  /**
   * Render the dossier as prompt text.
   * @param {Object} dossier - from build()
   * @param {Object} options
   * @param {AICurrency} options.currency - display currency (defaults to USD)
   * @param {string[]} options.sections - subset to render (default: everything present)
   */
  static format(dossier, { currency = null, sections = this.ALL_SECTIONS } = {}) {
    if (!dossier) return '';
    const cur = currency || new AICurrency('USD', { USD: 1 });
    const wanted = new Set(sections);
    const lines = [];

    if (wanted.has('profile')) this.formatProfile(dossier.profile, lines);
    if (wanted.has('observed')) this.formatObserved(dossier.observed, lines, cur);
    if (wanted.has('behavior')) this.formatBehavior(dossier.behavior, lines, cur);
    if (wanted.has('personality')) this.formatPersonality(dossier.personality, lines);
    if (wanted.has('edge')) this.formatEdge(dossier.edge, lines, cur);
    if (wanted.has('playbooks')) this.formatPlaybooks(dossier.playbooks, lines);
    if (wanted.has('risk')) this.formatRisk(dossier.risk, lines, cur);
    if (wanted.has('watchlist')) this.formatWatchlist(dossier.watchlist, lines);
    if (wanted.has('holdings')) this.formatHoldings(dossier.holdings, lines, cur);

    if (lines.length === 0) return '';
    return ['TRADER DOSSIER:', ...lines].join('\n').trimEnd();
  }

  /**
   * Convenience: build and format in one call. Never throws.
   */
  static async render(userId, { currency = null, sections = this.ALL_SECTIONS, force = false } = {}) {
    try {
      const dossier = await this.build(userId, { sections, force });
      return this.format(dossier, { currency, sections });
    } catch (error) {
      console.warn(`[AI_DOSSIER] Could not render dossier for ${userId}: ${error.message}`);
      return '';
    }
  }

  /**
   * Coaching priorities every AI feature should apply to the dossier.
   * Appended to prompt guidelines so each feature focuses on the same things.
   */
  static focusGuidelines() {
    return [
      'HOW TO USE THE TRADER DOSSIER:',
      '- Anchor on their stated goals and anything they asked you to remember; relate advice back to those.',
      '- Risk before returns: compare position size and open risk against their own limits, default stop, and typical size before discussing upside.',
      '- Process over outcome: judge trades by plan adherence, setup grade, and R, not by whether they made money.',
      '- When a known tendency (revenge trading, overconfidence, drift) is relevant to the question, name it with its numbers and give one concrete guardrail.',
      '- Where the declared profile and observed behavior disagree, point out the gap plainly.',
      '- Do not invent data that is not in the dossier or the sections below.'
    ].join('\n');
  }
}

module.exports = AITraderContext;
