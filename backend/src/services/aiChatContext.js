const db = require('../config/database');
const TradeQueries = require('./tradeQueries');
const finnhub = require('../utils/finnhubClient');
const { fxUsd } = require('../utils/tradeFx');
const AICurrency = require('./aiCurrency');
const AITraderContext = require('./aiTraderContext');
const { POSITION_GROUP_KEY, isPositionGroupingEnabled } = require('../utils/positionGrouping');
const { buildExcursionMetrics } = require('../utils/excursionMetrics');

// trades-table money columns read through trade_amount_usd() so every row is
// USD before the single USD -> display conversion (unaliased queries).
const usd = column => `${fxUsd(column, '')} AS ${column}`;

/**
 * AI Chat Context
 * Builds the journal-wide and per-symbol context that free-form AI chat and
 * resumed analysis follow-ups send to the model. Context is rebuilt on every
 * message so the assistant always sees current positions and market data.
 */
class AIChatContext {
  static MAX_FOCUS_SYMBOLS = 3;
  static MARKET_DATA_TIMEOUT_MS = 8000;

  // Uppercase words that look like tickers but almost always mean something
  // else in a trading conversation. Cashtags ($EPS) bypass this list.
  static SYMBOL_STOPWORDS = new Set([
    'I', 'A', 'AI', 'OK', 'PNL', 'P', 'L', 'EPS', 'CEO', 'CFO', 'IPO', 'ETF', 'USD', 'EUR', 'GBP', 'JPY',
    'ATR', 'RSI', 'MACD', 'VWAP', 'EMA', 'SMA', 'MA', 'ATH', 'ATL', 'YTD', 'QTD', 'MTD', 'YOY', 'QOQ',
    'DCA', 'FOMO', 'FOMC', 'CPI', 'PPI', 'GDP', 'FED', 'SEC', 'IRA', 'TFSA', 'RTH', 'ETH', 'AH', 'PM',
    'AM', 'EST', 'PST', 'UTC', 'DTE', 'OTM', 'ITM', 'ATM', 'IV', 'HV', 'PT', 'TP', 'SL', 'BE', 'R',
    'RR', 'MAE', 'MFE', 'TA', 'FA', 'DD', 'PE', 'PEG', 'FCF', 'EBIT', 'EBITDA', 'GAAP', 'Q', 'QQ',
    'Q1', 'Q2', 'Q3', 'Q4', 'FY', 'H1', 'H2', 'US', 'USA', 'UK', 'EU', 'API', 'CSV', 'IBKR', 'TOS',
    'AND', 'OR', 'THE', 'TO', 'IN', 'ON', 'IS', 'IT', 'MY', 'ME', 'DO', 'IF', 'SO', 'AT', 'BY', 'OF',
    'BUY', 'SELL', 'LONG', 'SHORT', 'CALL', 'PUT', 'CALLS', 'PUTS', 'HOLD', 'WHY', 'HOW', 'WHAT',
    'LOL', 'IMO', 'TBH', 'FYI', 'ASAP', 'NOT', 'NO', 'YES', 'ALL', 'ANY', 'TLDR'
  ]);

  static withTimeout(promise, ms = this.MARKET_DATA_TIMEOUT_MS) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Market data request timed out')), ms);
      })
    ]).finally(() => clearTimeout(timer));
  }

  static toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  static money(value) {
    const number = this.toNumber(value);
    return number === null ? 'N/A' : `$${number.toFixed(2)}`;
  }

  static percent(value) {
    const number = this.toNumber(value);
    return number === null ? 'N/A' : `${number.toFixed(2)}%`;
  }

  // Quantities are stored as NUMERIC(…, 8); drop the trailing zeros.
  static qty(value) {
    const number = this.toNumber(value);
    return number === null ? 'N/A' : String(number);
  }

  static bigMoney(value, code = 'USD') {
    const number = this.toNumber(value);
    if (number === null) return null;
    const abs = Math.abs(number);
    if (abs >= 1e9) return `${(number / 1e9).toFixed(2)}B ${code}`;
    if (abs >= 1e6) return `${(number / 1e6).toFixed(2)}M ${code}`;
    return `${number.toFixed(2)} ${code}`;
  }

  // Multiply the named USD money fields of each row into the display currency.
  static rowsToDisplay(rows, keys, currency) {
    return (rows || []).map(row => {
      const out = { ...row };
      keys.forEach(key => {
        if (out[key] !== null && out[key] !== undefined) out[key] = currency.fromUsd(out[key]);
      });
      return out;
    });
  }

  static isoDate(value) {
    if (!value) return 'N/A';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().split('T')[0];
  }

  static stripHtml(value, maxLength) {
    if (!value) return '';
    const text = String(value)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  /**
   * Find ticker symbols mentioned in free text. Cashtags ($NOW) always count;
   * bare uppercase words count when they are a symbol the user has traded, or
   * when they look like a ticker and are not a common trading abbreviation.
   * @returns {string[]} Up to MAX_FOCUS_SYMBOLS symbols, best matches first
   */
  static extractSymbols(text, knownSymbols = new Set()) {
    if (!text) return [];
    const source = String(text);
    const cashtags = [];
    const known = [];
    const candidates = [];

    for (const match of source.matchAll(/\$([A-Za-z]{1,6}(?:\.[A-Za-z]{1,2})?)\b/g)) {
      cashtags.push(match[1].toUpperCase());
    }

    for (const match of source.matchAll(/\b[A-Z]{1,6}(?:\.[A-Z]{1,2})?\b/g)) {
      const token = match[0];
      if (this.SYMBOL_STOPWORDS.has(token)) continue;
      if (knownSymbols.has(token)) {
        known.push(token);
      } else if (token.length >= 2 && token.length <= 5) {
        candidates.push(token);
      }
    }

    return [...new Set([...cashtags, ...known, ...candidates])].slice(0, this.MAX_FOCUS_SYMBOLS);
  }

  static async getKnownSymbols(userId) {
    const result = await db.query(
      `SELECT DISTINCT UPPER(COALESCE(NULLIF(underlying_symbol, ''), symbol)) AS symbol
       FROM trades
       WHERE user_id = $1 AND symbol IS NOT NULL AND symbol != ''
       LIMIT 5000`,
      [userId]
    );
    return new Set(result.rows.map(row => row.symbol).filter(Boolean));
  }

  static async getTradingProfile(userId) {
    try {
      const result = await db.query(
        `SELECT trading_strategies, trading_styles, risk_tolerance, experience_level,
                average_position_size, primary_markets, trading_goals, preferred_sectors
         FROM user_settings WHERE user_id = $1`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.warn('[AI_CHAT] Could not load trading profile:', error.message);
      return null;
    }
  }

  // getAnalytics identifies the exact trade (or, in whole-trade mode, the
  // position's first leg) behind its best/worst figures. Keep that pointer so
  // the prompt can show the trade, not just the amount.
  static extremeTradeRef(details) {
    if (!details?.id) return null;
    return { id: String(details.id), symbol: details.symbol || null, trade_date: details.trade_date || null };
  }

  /** The zone when the runtime knows it, else null (bad zones break AT TIME ZONE). */
  static validTimezone(timezone) {
    if (!timezone || typeof timezone !== 'string') return null;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return timezone;
    } catch (error) {
      return null;
    }
  }

  /** Today's calendar date (YYYY-MM-DD) in the given zone; UTC when invalid. */
  static todayIn(timezone, now = new Date()) {
    const zone = this.validTimezone(timezone) || 'UTC';
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }

  static shiftDate(isoDate, days) {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  static normalizeAccounts(accounts) {
    const list = Array.isArray(accounts) ? accounts : (typeof accounts === 'string' ? accounts.split(',') : []);
    const clean = [...new Set(list.map(account => String(account ?? '').trim()).filter(Boolean))];
    return clean.length ? clean : null;
  }

  /**
   * Normalize the chat scope: accounts from the global account filter and a
   * valid timezone (scope -> users.timezone -> UTC). `position_grouping`
   * (whole-trade analytics setting) is resolved once and carried along.
   * @returns {Promise<{accounts: string[]|null, timezone: string, position_grouping: boolean}>}
   */
  static async resolveScope(userId, scope = {}) {
    const accounts = this.normalizeAccounts(scope?.accounts);
    const [timezone, grouped] = await Promise.all([
      this.validTimezone(scope?.timezone) || db.query('SELECT timezone FROM users WHERE id = $1', [userId])
        .then(result => this.validTimezone(result.rows[0]?.timezone) || 'UTC')
        .catch(() => 'UTC'),
      typeof scope?.position_grouping === 'boolean'
        ? scope.position_grouping
        : isPositionGroupingEnabled(userId).catch(() => false)
    ]);
    return { accounts, timezone, position_grouping: grouped === true, resolved: true };
  }

  /**
   * The canonical trade WHERE clause (alias t, starts `WHERE t.user_id = $1`)
   * for the scope: excludes accounts with include_in_reports = false and
   * applies the account filter, exactly like the headline analytics.
   */
  static scopedWhere(userId, scope = {}) {
    const accounts = this.normalizeAccounts(scope?.accounts);
    return TradeQueries._buildWhereClause(userId, accounts ? { accounts } : {});
  }

  // Same rule as formatTradeDetail: imports label strategy by hold time and
  // only a manual choice (or manual override) is the trader's plan.
  static AUTO_STRATEGY_SQL = `(NULLIF(BTRIM(strategy), '') IS NOT NULL AND manual_override IS FALSE AND NULLIF(classification_method, '') IS NOT NULL AND classification_method <> 'manual')`;

  /**
   * `closed AS (...)` CTE over closed trades in scope, matching the headline
   * population (exit_price and pnl set). With whole-trade grouping on, legs
   * opened together collapse into one row like getAnalytics, so counts here
   * never exceed the headline. Multi-leg R is left null: combined R is
   * dollar-weighted (R_VALUE_CALCULATIONS.md), not a sum.
   */
  static closedTradesCte(whereClause, grouped, extraCondition = '') {
    const pnlUsd = fxUsd('pnl', '');
    const baseSymbol = `UPPER(COALESCE(NULLIF(underlying_symbol, ''), symbol))`;
    const filter = `${whereClause} AND exit_price IS NOT NULL AND pnl IS NOT NULL${extraCondition}`;
    if (!grouped) {
      return `closed AS (
        SELECT ${baseSymbol} AS base_symbol, ${pnlUsd} AS pnl_usd,
               NULLIF(BTRIM(setup), '') AS setup, NULLIF(BTRIM(strategy), '') AS strategy,
               ${this.AUTO_STRATEGY_SQL} AS auto_strategy, tags, side, instrument_type,
               entry_time, exit_time, r_value
        FROM trades t
        ${filter}
      )`;
    }
    return `closed AS (
      SELECT MIN(${baseSymbol}) AS base_symbol, SUM(${pnlUsd}) AS pnl_usd,
             MIN(NULLIF(BTRIM(setup), '')) AS setup, MIN(NULLIF(BTRIM(strategy), '')) AS strategy,
             BOOL_AND(${this.AUTO_STRATEGY_SQL}) AS auto_strategy,
             -- ARRAY_AGG over arrays needs equal lengths; take the first tagged leg's tags.
             STRING_TO_ARRAY((ARRAY_AGG(ARRAY_TO_STRING(tags, CHR(31)) ORDER BY entry_time, id)
               FILTER (WHERE COALESCE(CARDINALITY(tags), 0) > 0))[1], CHR(31)) AS tags,
             CASE WHEN COUNT(DISTINCT side) > 1 THEN 'multi-leg' ELSE MIN(side) END AS side,
             CASE WHEN COUNT(DISTINCT instrument_type) > 1 THEN 'mixed' ELSE MIN(instrument_type) END AS instrument_type,
             MIN(entry_time) AS entry_time, MAX(exit_time) AS exit_time,
             CASE WHEN COUNT(*) = 1 THEN MAX(r_value) END AS r_value
      FROM trades t
      ${filter}
      GROUP BY ${POSITION_GROUP_KEY}
    )`;
  }

  // Hold-time buckets, in display order.
  static HOLD_BUCKETS = [
    ['1', 'under 5m', `interval '5 minutes'`],
    ['2', '5-30m', `interval '30 minutes'`],
    ['3', '30m-2h', `interval '2 hours'`],
    ['4', '2h-1d', `interval '1 day'`],
    ['5', '1-7d', `interval '7 days'`],
    ['6', '1-4w', `interval '28 days'`],
    ['7', 'over 4w', null]
  ];

  static BREAKDOWN_DIMENSIONS = ['setup', 'strategy', 'entry_hour', 'weekday', 'hold_bucket', 'side', 'instrument_type'];

  /**
   * One GROUPING SETS pass over closed trades in scope for every
   * single-valued dimension (plus the grand total), and a parallel tag query
   * (tags is text[]; unnesting it in the same pass would multiply rows).
   * Entry hour/weekday use the trader's timezone; entries stamped exactly
   * 00:00 UTC are date-only imports, so they get no hour and a UTC weekday.
   */
  static async getBreakdowns(userId, scope, whereInfo = null) {
    const { whereClause, values } = whereInfo || await this.scopedWhere(userId, scope);
    const cte = this.closedTradesCte(whereClause, scope.position_grouping);
    const tzParam = `$${values.length + 1}`;
    const dateOnly = `(entry_time AT TIME ZONE 'UTC')::time = TIME '00:00:00'`;
    const holdCases = this.HOLD_BUCKETS
      .map(([key, , limit]) => (limit ? `WHEN exit_time - entry_time < ${limit} THEN '${key}'` : `ELSE '${key}'`))
      .join(' ');
    const grouping = this.BREAKDOWN_DIMENSIONS
      .map(dim => `WHEN GROUPING(${dim}) = 0 THEN '${dim}'`)
      .join(' ');
    const value = this.BREAKDOWN_DIMENSIONS
      .map(dim => `WHEN GROUPING(${dim}) = 0 THEN ${dim}::text`)
      .join(' ');
    const metrics = `COUNT(*)::int AS trades,
           COALESCE(SUM(pnl_usd), 0) AS total_pnl,
           AVG(CASE WHEN pnl_usd > 0 THEN 100.0 ELSE 0 END) AS win_rate,
           AVG(r_value) AS avg_r,
           COUNT(r_value)::int AS r_trades`;

    const [dimensions, tags] = await Promise.all([
      db.query(
        `WITH ${cte},
         shaped AS (
           SELECT *,
                  CASE WHEN entry_time IS NULL OR ${dateOnly} THEN NULL
                       ELSE EXTRACT(HOUR FROM entry_time AT TIME ZONE ${tzParam})::int END AS entry_hour,
                  CASE WHEN entry_time IS NULL THEN NULL
                       WHEN ${dateOnly} THEN EXTRACT(ISODOW FROM entry_time AT TIME ZONE 'UTC')::int
                       ELSE EXTRACT(ISODOW FROM entry_time AT TIME ZONE ${tzParam})::int END AS weekday,
                  CASE WHEN entry_time IS NULL OR exit_time IS NULL OR exit_time < entry_time THEN NULL
                       ${holdCases} END AS hold_bucket
           FROM closed
         )
         SELECT CASE ${grouping} ELSE 'total' END AS dimension,
                CASE ${value} END AS value,
                ${metrics},
                COUNT(*) FILTER (WHERE auto_strategy)::int AS auto_trades,
                COUNT(*) FILTER (WHERE COALESCE(CARDINALITY(tags), 0) > 0)::int AS tagged_trades
         FROM shaped
         GROUP BY GROUPING SETS ((setup), (strategy), (entry_hour), (weekday), (hold_bucket), (side), (instrument_type), ())`,
        [...values, scope.timezone || 'UTC']
      ).then(result => result.rows),
      db.query(
        `WITH ${cte}
         SELECT 'tag' AS dimension, BTRIM(tag) AS value, ${metrics}
         FROM closed CROSS JOIN LATERAL UNNEST(tags) AS tag
         WHERE NULLIF(BTRIM(tag), '') IS NOT NULL
         GROUP BY BTRIM(tag)
         ORDER BY COUNT(*) DESC, BTRIM(tag)
         LIMIT ${this.MAX_BREAKDOWN_ROWS}`,
        values
      ).then(result => result.rows)
    ]);

    return { rows: dimensions, tags };
  }

  static MAX_BREAKDOWN_ROWS = 8;
  static SMALL_SAMPLE = 5;

  static async getSymbolStats(userId, scope, whereInfo = null) {
    const { whereClause, values } = whereInfo || await this.scopedWhere(userId, scope);
    const result = await db.query(
      `WITH ${this.closedTradesCte(whereClause, scope.position_grouping)}
       SELECT base_symbol AS symbol,
              COUNT(*)::int AS trades,
              COALESCE(SUM(pnl_usd), 0) AS total_pnl,
              AVG(CASE WHEN pnl_usd > 0 THEN 100.0 ELSE 0 END) AS win_rate,
              MAX(COALESCE(exit_time, entry_time)) AS last_traded
       FROM closed
       GROUP BY 1
       ORDER BY COUNT(*) DESC, SUM(pnl_usd) DESC
       LIMIT 15`,
      values
    );
    return result.rows;
  }

  // Remaining open quantity from executions, as the open-positions API does
  // (trade.controller calculateRemainingOpenQuantity): a partly exited row's
  // quantity is the original size.
  static openQuantity(position) {
    const fills = this.parseExecutions(position.executions);
    const side = String(position.side || '').toLowerCase();
    if (fills.length) {
      let entered = 0;
      let exited = 0;
      fills.forEach(fill => {
        const action = String(fill.action || fill.side || '').toLowerCase();
        const quantity = Number(fill.quantity || 0);
        if (!quantity) return;
        if (side === 'long') {
          if (action === 'buy') entered += quantity;
          if (action === 'sell') exited += quantity;
        } else if (side === 'short') {
          if (action === 'sell' || action === 'short') entered += quantity;
          if (action === 'buy' || action === 'cover') exited += quantity;
        }
      });
      const remaining = Math.max(0, entered - exited);
      if (remaining > 0) return remaining;
    }
    return this.toNumber(position.quantity);
  }

  static QUOTE_INSTRUMENTS = new Set(['stock', 'etf', 'crypto']);
  static MAX_QUOTE_SYMBOLS = 10;
  static QUOTE_BATCH_TIMEOUT_MS = 3000;
  static QUOTE_CACHE_FRESH = `INTERVAL '2 minutes'`;

  // A bare-ticker Finnhub quote is the US listing, so only USD-listed rows
  // (original_currency) are priced; a non-USD row could be another listing.
  static quoteSymbol(position) {
    const type = String(position.instrument_type || 'stock').toLowerCase();
    if (!this.QUOTE_INSTRUMENTS.has(type) || !position.symbol) return null;
    if (String(position.listing_currency || 'USD').toUpperCase() !== 'USD') return null;
    return String(position.symbol).toUpperCase();
  }

  /**
   * Last prices for open stock/ETF/crypto positions, for an approximate
   * unrealized P&L. Fresh price_monitoring rows first (what the open
   * positions page uses), then one time-boxed Finnhub batch for the rest
   * (its 1-minute quote cache absorbs repeat chat messages). Options and
   * futures are skipped: their quotes need contract multipliers.
   * @returns {Promise<Object<string, number>>} symbol -> last price in the listing currency
   */
  static async getOpenPositionQuotes(userId, positions) {
    if (!finnhub.isConfigured() || !positions?.length) return {};
    // Largest positions first (entry x open size), so the cap drops the
    // smallest ones rather than the oldest.
    const notional = position => Math.abs((this.toNumber(position.entry_price) || 0) * (this.toNumber(position.open_quantity ?? position.quantity) || 0));
    const symbols = [...new Set(positions
      .filter(position => this.quoteSymbol(position))
      .sort((a, b) => notional(b) - notional(a))
      .map(position => this.quoteSymbol(position)))]
      .slice(0, this.MAX_QUOTE_SYMBOLS);
    if (!symbols.length) return {};

    const load = async () => {
      const prices = {};
      try {
        const cached = await db.query(
          `SELECT symbol, current_price FROM price_monitoring
           WHERE symbol = ANY($1) AND last_updated > NOW() - ${this.QUOTE_CACHE_FRESH}`,
          [symbols]
        );
        cached.rows.forEach(row => {
          const price = this.toNumber(row.current_price);
          if (price && price > 0) prices[String(row.symbol).toUpperCase()] = price;
        });
      } catch (error) {
        console.warn('[AI_CHAT] Price cache lookup failed:', error.message);
      }

      const missing = symbols.filter(symbol => !prices[symbol]);
      if (missing.length) {
        const fresh = await finnhub.getBatchQuotes(missing, {
          source: 'ai_chat',
          priority: 0,
          userId,
          maxQueueWaitMs: this.QUOTE_BATCH_TIMEOUT_MS - 500
        });
        Object.entries(fresh || {}).forEach(([symbol, quote]) => {
          const price = this.toNumber(quote?.c);
          if (price && price > 0) prices[String(symbol).toUpperCase()] = price;
        });
      }
      return prices;
    };

    try {
      return await this.withTimeout(load(), this.QUOTE_BATCH_TIMEOUT_MS);
    } catch (error) {
      console.warn('[AI_CHAT] Open position quotes unavailable:', error.message);
      return {};
    }
  }

  /**
   * Attach approximate unrealized P&L to display-currency positions. The
   * quote is in the listing currency (the trade's original_currency) and is
   * converted before comparing with the converted entry.
   */
  static async applyUnrealized(positions, prices, currency) {
    if (!positions?.length || !prices || !Object.keys(prices).length) return positions;
    const codes = positions
      .filter(position => prices[this.quoteSymbol(position)])
      .map(position => String(position.listing_currency || 'USD').toUpperCase());
    try {
      await currency.ensureRates(codes);
    } catch (error) {
      console.warn('[AI_CHAT] Quote currency rates unavailable:', error.message);
    }
    return positions.map(position => {
      const symbol = this.quoteSymbol(position);
      const native = symbol ? prices[symbol] : null;
      if (!native) return position;
      const code = String(position.listing_currency || 'USD').toUpperCase();
      const last = currency.convert(native, code);
      const entry = this.toNumber(position.entry_price);
      const quantity = this.toNumber(position.open_quantity ?? position.quantity);
      if (last === null || entry === null || !quantity) return position;
      const unrealized = (last - entry) * quantity * (position.side === 'short' ? -1 : 1);
      return { ...position, last_price: last, quote_currency: code, unrealized_pnl: unrealized };
    });
  }

  /** ", approx. unrealized P&L +X (GAIN: last price ... entry on a long position)" or ''. */
  static unrealizedText(unrealized, lastPrice, entryPrice, side, currency) {
    if (unrealized === null || unrealized === undefined || lastPrice === null || lastPrice === undefined || entryPrice === null) return '';
    const money = value => currency.format(value);
    // Spell out gain vs loss and the price comparison: smaller models
    // misread a bare signed number as the wrong direction.
    return `, approx. unrealized P&L ${unrealized >= 0 ? '+' : ''}${money(unrealized)} (${unrealized >= 0 ? 'GAIN' : 'LOSS'}: last price ${money(lastPrice)} is ${lastPrice >= entryPrice ? 'above' : 'below'} the ${money(entryPrice)} entry on a ${side} position)`;
  }

  static async getAccountDirectory(userId) {
    const result = await db.query(
      `SELECT account_identifier, account_name, include_in_reports
       FROM user_accounts
       WHERE user_id = $1 AND account_identifier IS NOT NULL AND account_identifier != ''`,
      [userId]
    );
    return result.rows;
  }

  /** "account X (name)" list text for an account scope, or null for all accounts. */
  static scopeLabel(accounts, directory = []) {
    if (!accounts?.length) return null;
    if (accounts.includes('__unsorted__')) return 'trades with no account assigned only';
    const names = new Map((directory || []).map(row => [String(row.account_identifier), row.account_name]));
    const list = accounts.map(account => (names.get(account) ? `${account} (${this.stripHtml(names.get(account), 60)})` : account));
    return `${list.length > 1 ? 'accounts' : 'account'} ${list.join(', ')} only`;
  }

  // getAnalytics aggregates are USD-normalized; convert the money fields.
  static summarizeAnalytics(analytics, currency) {
    const summary = analytics?.summary || {};
    return {
      best_trade_ref: this.extremeTradeRef(analytics?.bestTradeDetails),
      worst_trade_ref: this.extremeTradeRef(analytics?.worstTradeDetails),
      total_trades: summary.totalTrades || 0,
      total_pnl: currency.fromUsd(summary.totalPnL),
      win_rate: summary.winRate,
      profit_factor: summary.profitFactor,
      avg_win: currency.fromUsd(summary.avgWin),
      avg_loss: currency.fromUsd(summary.avgLoss),
      best_trade: currency.fromUsd(summary.bestTrade),
      worst_trade: currency.fromUsd(summary.worstTrade),
      max_drawdown: currency.fromUsd(summary.maxDrawdown),
      trading_days: summary.tradingDays
    };
  }

  /**
   * Journal-wide snapshot: performance, open positions, per-symbol and
   * per-strategy breakdowns, recent trades, and recent journal entries.
   * @param {Object} [scope]
   * @param {string[]} [scope.accounts] - account_identifier values from the
   *   global account filter; empty/undefined means all reporting accounts.
   * @param {string} [scope.timezone] - user timezone for day-based windows
   *   (falls back to users.timezone, then UTC).
   */
  static async buildAccountContext(userId, currency = null, scope = {}) {
    const [resolvedCurrency, resolved] = await Promise.all([
      currency || AICurrency.forUser(userId),
      this.resolveScope(userId, scope)
    ]);
    currency = resolvedCurrency;
    scope = resolved;
    const today = this.todayIn(scope.timezone);
    const thirtyDaysAgo = this.shiftDate(today, -30);
    const analyticsScope = scope.accounts ? { accounts: scope.accounts } : {};

    const settle = async (label, promise, fallback) => {
      try {
        return await promise;
      } catch (error) {
        console.warn(`[AI_CHAT] Could not load ${label}:`, error.message);
        return fallback;
      }
    };

    // Every raw list shares the analytics WHERE clause so it covers the same
    // trades as the headline (scope + accounts excluded from reports).
    const where = await this.scopedWhere(userId, scope);
    const { whereClause, values } = where;

    const openPositionsPromise = db.query(
      `SELECT symbol, underlying_symbol, side, quantity, ${usd('entry_price')}, entry_time,
              instrument_type, option_type, ${usd('strike_price')}, expiration_date,
              account_identifier, broker, ${usd('stop_loss')}, ${usd('take_profit')}, strategy, setup, notes,
              executions, UPPER(COALESCE(NULLIF(original_currency, ''), 'USD')) AS listing_currency
       FROM trades t
       ${whereClause} AND entry_price IS NOT NULL AND exit_price IS NULL
       ORDER BY entry_time DESC
       LIMIT 40`,
      values
    ).then(result => result.rows.map(({ executions, ...row }) => ({ ...row, open_quantity: this.openQuantity({ ...row, executions }) })));

    // Quotes chain off the positions query so the time box overlaps the
    // analytics queries instead of adding to them.
    const openWithQuotes = openPositionsPromise.then(async rows => {
      const display = this.rowsToDisplay(rows, ['entry_price', 'strike_price', 'stop_loss', 'take_profit'], currency);
      const prices = await this.getOpenPositionQuotes(userId, rows);
      return this.applyUnrealized(display, prices, currency);
    });

    const [allTime, lastThirty, openPositions, symbolStats, breakdowns, recentTrades, accountDirectory, journal, profile, dossier] = await Promise.all([
      settle('all-time analytics', TradeQueries.getAnalytics(userId, { ...analyticsScope }), null),
      settle('30-day analytics', TradeQueries.getAnalytics(userId, { ...analyticsScope, startDate: thirtyDaysAgo }), null),
      settle('open positions', openWithQuotes, []),
      settle('symbol stats', this.getSymbolStats(userId, scope, where), []),
      settle('performance breakdowns', this.getBreakdowns(userId, scope, where), null),
      settle('recent trades', db.query(
        `SELECT symbol, side, quantity, ${usd('entry_price')}, ${usd('exit_price')}, entry_time, exit_time,
                ${usd('pnl')}, r_value, strategy, setup, LEFT(notes, 2000) AS notes, instrument_type, quality_grade,
                ${usd('mae')}, ${usd('mfe')}, stop_loss IS NOT NULL AS had_stop
         FROM trades t
         ${whereClause} AND exit_price IS NOT NULL
         ORDER BY exit_time DESC NULLS LAST, entry_time DESC
         LIMIT 15`,
        values
      ).then(result => result.rows), []),
      settle('account directory', this.getAccountDirectory(userId), []),
      settle('journal entries', db.query(
        `SELECT entry_date, entry_type, title, market_bias, content, lessons_learned, followed_plan
         FROM diary_entries
         WHERE user_id = $1
         ORDER BY entry_date DESC, created_at DESC
         LIMIT 5`,
        [userId]
      ).then(result => result.rows), []),
      this.getTradingProfile(userId),
      settle('trader dossier', AITraderContext.build(userId), null)
    ]);

    const allTimeStats = allTime ? this.summarizeAnalytics(allTime, currency) : null;
    const lastThirtyStats = lastThirty ? this.summarizeAnalytics(lastThirty, currency) : null;
    const extremeTrades = await settle('best/worst trade details', this.buildExtremeTrades(userId, [
      { label: 'All-time best trade', ref: allTimeStats?.best_trade_ref, stat: allTimeStats?.best_trade },
      { label: 'All-time worst trade', ref: allTimeStats?.worst_trade_ref, stat: allTimeStats?.worst_trade },
      { label: 'Last 30 days best trade', ref: lastThirtyStats?.best_trade_ref, stat: lastThirtyStats?.best_trade },
      { label: 'Last 30 days worst trade', ref: lastThirtyStats?.worst_trade_ref, stat: lastThirtyStats?.worst_trade }
    ], currency, scope.timezone), { timezone: scope.timezone, trades: [] });

    const breakdownRows = breakdowns ? this.rowsToDisplay(breakdowns.rows, ['total_pnl'], currency) : [];
    const strategyStats = breakdownRows
      .filter(row => row.dimension === 'strategy')
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 10)
      .map(row => ({ strategy: row.value ?? 'unlabeled', trades: row.trades, total_pnl: row.total_pnl, win_rate: row.win_rate, auto_trades: row.auto_trades }));

    return {
      generated_at: new Date().toISOString(),
      currency,
      scope: {
        accounts: scope.accounts,
        timezone: scope.timezone,
        position_grouping: scope.position_grouping,
        label: this.scopeLabel(scope.accounts, accountDirectory),
        excluded_accounts: (accountDirectory || [])
          .filter(row => row.include_in_reports === false)
          .map(row => ({ account_identifier: row.account_identifier, account_name: row.account_name }))
      },
      profile,
      dossier,
      all_time: allTimeStats,
      last_30_days: lastThirtyStats,
      extreme_trades: extremeTrades,
      open_positions: openPositions,
      symbol_stats: this.rowsToDisplay(symbolStats, ['total_pnl'], currency),
      strategy_stats: strategyStats,
      breakdowns: breakdowns
        ? { rows: breakdownRows, tags: this.rowsToDisplay(breakdowns.tags, ['total_pnl'], currency), timezone: scope.timezone, position_grouping: scope.position_grouping }
        : null,
      recent_trades: this.rowsToDisplay(recentTrades, ['entry_price', 'exit_price', 'pnl', 'mae', 'mfe'], currency),
      journal_entries: journal
    };
  }

  static SYMBOL_TRADE_MONEY_KEYS = ['entry_price', 'exit_price', 'pnl', 'stop_loss', 'take_profit', 'strike_price'];
  static SYMBOL_OPEN_ROWS = 10;
  static SYMBOL_CLOSED_ROWS = 20;
  static SYMBOL_JOURNAL_ROWS = 3;

  static symbolCondition(param, alias = '') {
    const a = alias ? `${alias}.` : '';
    return ` AND (UPPER(${a}symbol) = ${param} OR UPPER(${a}underlying_symbol) = ${param})`;
  }

  /**
   * The user's open trades and most recent closed trades on a symbol, in
   * scope. Open rows come first, like before.
   */
  static async getUserSymbolTrades(userId, symbol, scope = {}, whereInfo = null) {
    const { whereClause, values } = whereInfo || await this.scopedWhere(userId, scope);
    const param = `$${values.length + 1}`;
    const columns = `symbol, side, quantity, ${usd('entry_price')}, ${usd('exit_price')}, entry_time, exit_time, ${usd('pnl')},
              r_value, ${usd('stop_loss')}, ${usd('take_profit')}, stop_loss IS NOT NULL AS had_stop, strategy, setup,
              LEFT(notes, 2000) AS notes, instrument_type, option_type, ${usd('strike_price')}, expiration_date,
              account_identifier, manual_override, classification_method`;
    const base = `FROM trades t ${whereClause}${this.symbolCondition(param)}`;
    const result = await db.query(
      `(SELECT ${columns} ${base} AND exit_price IS NULL
        ORDER BY entry_time DESC NULLS LAST LIMIT ${this.SYMBOL_OPEN_ROWS})
       UNION ALL
       (SELECT ${columns} ${base} AND exit_price IS NOT NULL
        ORDER BY exit_time DESC NULLS LAST, entry_time DESC LIMIT ${this.SYMBOL_CLOSED_ROWS})`,
      [...values, symbol]
    );
    return result.rows;
  }

  /** Totals over EVERY closed trade on the symbol in scope (USD). */
  static async getUserSymbolTotals(userId, symbol, scope = {}, whereInfo = null) {
    const { whereClause, values } = whereInfo || await this.scopedWhere(userId, scope);
    const param = `$${values.length + 1}`;
    const result = await db.query(
      `WITH ${this.closedTradesCte(whereClause, scope.position_grouping, this.symbolCondition(param))}
       SELECT COUNT(*)::int AS trades,
              COALESCE(SUM(pnl_usd), 0) AS total_pnl,
              AVG(CASE WHEN pnl_usd > 0 THEN 100.0 ELSE 0 END) AS win_rate,
              AVG(r_value) AS avg_r,
              COUNT(r_value)::int AS r_trades,
              MIN(entry_time) AS first_traded,
              MAX(COALESCE(exit_time, entry_time)) AS last_traded
       FROM closed`,
      [...values, symbol]
    );
    return result.rows[0] || null;
  }

  /** Journal entries linked to any in-scope trade on the symbol. */
  static async getSymbolJournal(userId, symbol, scope = {}, whereInfo = null) {
    const { whereClause, values } = whereInfo || await this.scopedWhere(userId, scope);
    const param = `$${values.length + 1}`;
    const result = await db.query(
      `SELECT d.entry_date, d.entry_type, d.title, d.content, d.lessons_learned
       FROM diary_entries d
       WHERE d.user_id = $1 AND d.linked_trades IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM trades t
           ${whereClause}${this.symbolCondition(param, 't')} AND t.id = ANY(d.linked_trades)
         )
       ORDER BY d.entry_date DESC, d.created_at DESC
       LIMIT ${this.SYMBOL_JOURNAL_ROWS}`,
      [...values, symbol]
    );
    return result.rows;
  }

  static MAX_DETAIL_LEGS = 8;
  static MAX_DETAIL_FILLS = 10;
  static DETAIL_NOTES_CHARS = 500;
  static DETAIL_JOURNAL_CHARS = 300;

  // Raw (unconverted) columns: detail rows go through convertTradeRow so the
  // top-level amounts and the nested executions share one conversion.
  static TRADE_DETAIL_COLUMNS = [
    'id', 'symbol', 'underlying_symbol', 'side', 'quantity', 'entry_price', 'exit_price', 'entry_time', 'exit_time',
    'trade_date', 'pnl', 'pnl_percent', 'commission', 'fees', 'r_value', 'stop_loss', 'take_profit', 'mae', 'mfe',
    'quality_grade', 'quality_score', 'strategy', 'setup', 'tags', 'confidence', 'notes', 'executions',
    'instrument_type', 'option_type', 'strike_price', 'expiration_date', 'account_identifier', 'broker',
    'classification_method', 'manual_override',
    'original_currency', 'original_entry_price_currency', 'original_exit_price_currency', 'original_pnl_currency',
    'point_value', 'contract_size', 'underlying_asset',
    'post_exit_mae', 'post_exit_mfe', 'post_exit_window_minutes',
    'manual_target_hit_first', 'take_profit_targets', 'management_r', 'news_sentiment'
  ];

  // Computed detail fields. Names are chosen so scaleMoneyInPayload leaves
  // them alone (_count suffix, no price/pnl/amount words); target_hit_analysis
  // and news_events are reduced in SQL instead of shipping the whole JSON.
  static tradeDetailExtras(alias = 'c') {
    const a = alias;
    const analysis = `${a}.target_hit_analysis->'analysis_result'`;
    return [
      `((SELECT COUNT(*) FROM trade_charts tch WHERE tch.trade_id = ${a}.id) + CASE WHEN NULLIF(${a}.chart_url, '') IS NOT NULL THEN 1 ELSE 0 END)::int AS chart_count`,
      `CASE WHEN jsonb_typeof(${a}.news_events) = 'array' THEN jsonb_array_length(${a}.news_events) ELSE 0 END AS news_count`,
      `CASE WHEN jsonb_typeof(${a}.news_events) = 'array' THEN (
         SELECT jsonb_agg(jsonb_build_object('headline', top.item->>'headline', 'datetime', top.item->>'datetime', 'sentiment', top.item->>'sentiment'))
         FROM (SELECT value AS item FROM jsonb_array_elements(${a}.news_events) ORDER BY value->>'datetime' DESC NULLS LAST LIMIT 2) top
       ) END AS news_headlines`,
      `${analysis}->>'first_target_hit' AS target_hit_first`,
      `${analysis}->>'first_target_label' AS target_hit_label`,
      `${analysis}->>'first_hit_time' AS target_hit_time`,
      `${analysis}->>'used_exit_price_analysis' AS target_hit_inferred`
    ];
  }

  /**
   * Full rows for the trades analytics named as best/worst, plus journal
   * entries linked to them. In whole-trade mode analytics sums a position's
   * legs and points at one of them, so every leg sharing that position key is
   * loaded and the shown P&L matches the statistic.
   * @returns {Promise<{timezone: string, byAnchor: Map<string, {legs: Object[], journal: Object[]}>}>}
   */
  static async getTradeDetails(userId, ids, currency, timezone = null) {
    const unique = [...new Set((ids || []).filter(Boolean).map(String))];
    const byAnchor = new Map();
    const knownTimezone = this.validTimezone(timezone);
    if (!unique.length) return { timezone: knownTimezone || 'UTC', byAnchor };

    const [grouped, resolvedTimezone] = await Promise.all([
      isPositionGroupingEnabled(userId).catch(() => false),
      knownTimezone || db.query('SELECT timezone FROM users WHERE id = $1', [userId])
        .then(result => this.validTimezone(result.rows[0]?.timezone) || 'UTC')
        .catch(() => 'UTC')
    ]);
    timezone = resolvedTimezone;

    const columns = [...this.TRADE_DETAIL_COLUMNS.map(column => `c.${column}`), ...this.tradeDetailExtras('c')].join(', ');
    const tradeQuery = grouped
      // A closed anchor (best/worst pointer) only pulls closed legs, matching
      // the analytics figure; an open anchor pulls every leg of its position.
      // The anchor row itself is always returned.
      ? `WITH anchors AS (
           SELECT id AS anchor_id, ${POSITION_GROUP_KEY} AS group_key,
                  COALESCE(NULLIF(underlying_symbol, ''), symbol) AS base_symbol,
                  (exit_price IS NOT NULL AND pnl IS NOT NULL) AS anchor_closed
           FROM trades
           WHERE user_id = $1 AND id = ANY($2::uuid[])
         ),
         candidates AS (
           SELECT trades.*, ${POSITION_GROUP_KEY} AS group_key
           FROM trades
           WHERE user_id = $1
             AND COALESCE(NULLIF(underlying_symbol, ''), symbol) IN (SELECT base_symbol FROM anchors)
         )
         SELECT a.anchor_id, ${columns}
         FROM anchors a
         JOIN candidates c ON c.group_key = a.group_key
           AND (c.id = a.anchor_id OR NOT a.anchor_closed OR (c.exit_price IS NOT NULL AND c.pnl IS NOT NULL))
         ORDER BY a.anchor_id, c.entry_time NULLS LAST, c.id`
      : `SELECT c.id AS anchor_id, ${columns}
         FROM trades c
         WHERE c.user_id = $1 AND c.id = ANY($2::uuid[])`;

    const [tradeResult, journalResult] = await Promise.all([
      db.query(tradeQuery, [userId, unique]),
      db.query(
        `SELECT entry_date, entry_type, title, content, lessons_learned, linked_trades::text[] AS linked_trades
         FROM diary_entries
         WHERE user_id = $1 AND linked_trades && $2::uuid[]
         ORDER BY entry_date DESC, created_at DESC
         LIMIT 10`,
        [userId, unique]
      ).then(result => result.rows).catch(error => {
        console.warn('[AI_CHAT] Could not load journal entries linked to trades:', error.message);
        return [];
      })
    ]);

    const rows = tradeResult.rows || [];
    try {
      await currency.ensureRowRates(rows);
    } catch (error) {
      // Rows without a rate stay in their own currency, as in the trade query.
    }

    for (const row of rows) {
      const anchor = String(row.anchor_id);
      if (!byAnchor.has(anchor)) byAnchor.set(anchor, { legs: [], journal: [] });
      const { anchor_id: _anchor, ...trade } = row;
      byAnchor.get(anchor).legs.push(currency.convertTradeRow(trade).value);
    }

    for (const [anchor, detail] of byAnchor) {
      const legIds = new Set(detail.legs.map(leg => String(leg.id)));
      detail.journal = journalResult
        .filter(entry => (entry.linked_trades || []).some(id => legIds.has(String(id))) || (entry.linked_trades || []).includes(anchor))
        .slice(0, 2);
    }

    return { timezone, byAnchor };
  }

  /**
   * Resolve labeled best/worst pointers into detail entries. A trade that is
   * both the all-time and the 30-day best is shown once with both labels.
   * @param {Array<{label: string, ref: {id: string}|null, stat: number|null}>} items
   * @returns {Promise<{timezone: string, trades: Object[]}>}
   */
  static async buildExtremeTrades(userId, items, currency, timezone = null) {
    const wanted = (items || []).filter(item => item?.ref?.id);
    if (!wanted.length) return { timezone: this.validTimezone(timezone) || 'UTC', trades: [] };

    const { timezone: resolvedTimezone, byAnchor } = await this.getTradeDetails(userId, wanted.map(item => item.ref.id), currency, timezone);
    const merged = new Map();
    for (const item of wanted) {
      const detail = byAnchor.get(String(item.ref.id));
      if (!detail?.legs?.length) continue;
      const existing = merged.get(String(item.ref.id));
      if (existing) {
        existing.labels.push(item.label);
      } else {
        merged.set(String(item.ref.id), { labels: [item.label], stat: item.stat ?? null, legs: detail.legs, journal: detail.journal });
      }
    }
    return { timezone: resolvedTimezone, trades: [...merged.values()] };
  }

  // Prices keep up to four decimals (FX pairs, penny stocks, option
  // premiums); cents alone hid the move on large-size trades.
  static priceText(currency, value) {
    const number = this.toNumber(value);
    if (number === null) return 'N/A';
    const digits = Math.abs(number).toFixed(4).replace(/(\.\d\d\d?)0+$/, '$1').replace(/(\.\d\d)0$/, '$1');
    return `${number < 0 ? '-' : ''}${currency.symbol}${digits}`;
  }

  // Importers write bookkeeping like "Round trip: 2 executions" into notes.
  static SYSTEM_NOTE_PATTERN = /^(round trip(?: trade)?: \d+ executions?|open position: \d+ executions?|closed existing position: \d+ closing executions?|updated open position: \d+ new executions? added|trade #\d+ - duration: [\d:.]+)(\s*\|\s*auto-closed:[^|]*)?$/i;

  /** Trade notes the trader wrote, or '' for importer bookkeeping. */
  static traderNotes(notes, maxLength) {
    const text = this.stripHtml(notes, maxLength);
    return this.SYSTEM_NOTE_PATTERN.test(text) ? '' : text;
  }

  // Trade.create stores confidence 5 when none was given.
  static DEFAULT_CONFIDENCE = 5;

  static localTime(value, timezone, { withDate = true } = {}) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || 'UTC',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(date).map(part => [part.type, part.value]));
      const time = `${parts.hour}:${parts.minute}`;
      return withDate ? `${parts.year}-${parts.month}-${parts.day} ${time}` : time;
    } catch (error) {
      const iso = date.toISOString();
      return withDate ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso.slice(11, 16);
    }
  }

  static duration(start, end) {
    const from = start ? new Date(start).getTime() : NaN;
    const to = end ? new Date(end).getTime() : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
    const minutes = Math.round((to - from) / 60000);
    if (minutes < 1) return 'under 1m';
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    return [days ? `${days}d` : null, hours ? `${hours}h` : null, !days && mins ? `${mins}m` : null].filter(Boolean).join(' ') || '0m';
  }

  static parseExecutions(executions) {
    let fills = executions;
    if (typeof fills === 'string') {
      try { fills = JSON.parse(fills); } catch (error) { return []; }
    }
    return Array.isArray(fills) ? fills.filter(fill => fill && typeof fill === 'object') : [];
  }

  // Executions come in two shapes: single fills (action/price/datetime) and
  // grouped round trips (entryPrice/exitPrice/pnl), in camel or snake case.
  static formatFill(fill, currency, timezone) {
    const pick = (...keys) => keys.map(key => fill[key]).find(value => value !== null && value !== undefined && value !== '');
    const price = value => this.priceText(currency, value);
    const quantity = pick('quantity', 'qty', 'shares');
    const entryPrice = pick('entryPrice', 'entry_price');
    const exitPrice = pick('exitPrice', 'exit_price');

    if (entryPrice !== undefined && exitPrice !== undefined) {
      const entryTime = this.localTime(pick('entryTime', 'entry_time', 'datetime'), timezone);
      const exitTime = this.localTime(pick('exitTime', 'exit_time', 'exit_date'), timezone);
      const pnl = pick('pnl', 'realized_pnl');
      return `${pick('side', 'action') || 'round trip'} ${quantity !== undefined ? this.qty(quantity) : '?'} @ ${price(entryPrice)}${entryTime ? ` (${entryTime})` : ''} -> ${price(exitPrice)}${exitTime ? ` (${exitTime})` : ''}${pnl !== undefined ? `, P&L ${currency.format(pnl)}` : ''}`;
    }

    const time = this.localTime(pick('datetime', 'entryTime', 'entry_time', 'time'), timezone);
    return `${time ? `${time} ` : ''}${pick('action', 'side', 'type') || 'fill'} ${quantity !== undefined ? this.qty(quantity) : '?'} @ ${price(pick('price', 'entryPrice', 'entry_price'))}`;
  }

  /**
   * Prompt lines for one trade: execution, plan, risk, fills, notes. Blank
   * plan fields are printed as "not recorded" so the model reports the gap
   * instead of inventing a setup.
   */
  static formatTradeDetail(trade, currency, timezone, indent = '  ') {
    const money = value => currency.format(value);
    const price = value => this.priceText(currency, value);
    const has = value => value !== null && value !== undefined && value !== '';
    const lines = [];

    const instrument = trade.instrument_type === 'option'
      ? `option ${trade.underlying_symbol || ''} ${price(trade.strike_price)} ${trade.option_type || ''} exp ${this.isoDate(trade.expiration_date)}`.replace(/\s+/g, ' ')
      : (trade.instrument_type || 'stock');
    const held = this.duration(trade.entry_time, trade.exit_time);
    const costs = (this.toNumber(trade.commission) || 0) + (this.toNumber(trade.fees) || 0);
    const where = [trade.account_identifier ? `account ${trade.account_identifier}` : null, trade.broker ? `broker ${trade.broker}` : null].filter(Boolean).join(', ');
    lines.push(`${indent}${trade.symbol} ${instrument} ${trade.side} ${this.qty(trade.quantity)} @ ${price(trade.entry_price)} -> ${price(trade.exit_price)}; entry ${this.localTime(trade.entry_time, timezone) || this.isoDate(trade.trade_date)}, exit ${this.localTime(trade.exit_time, timezone) || 'N/A'}${held ? ` (held ${held})` : ''}; P&L ${money(trade.pnl)}${has(trade.pnl_percent) ? ` (${this.percent(trade.pnl_percent)})` : ''}; commission+fees ${money(costs)}${where ? `; ${where}` : ''}`);

    const tags = Array.isArray(trade.tags) && trade.tags.length ? trade.tags.join(', ') : 'none';
    // Imports label strategy by hold time; only a manual choice is the plan.
    const autoStrategy = has(trade.strategy) && trade.manual_override === false && has(trade.classification_method) && trade.classification_method !== 'manual';
    const strategy = has(trade.strategy) ? `${trade.strategy}${autoStrategy ? ' (auto-classified from hold time, not chosen by the trader)' : ''}` : 'not recorded';
    const confidence = has(trade.confidence) && Number(trade.confidence) !== this.DEFAULT_CONFIDENCE ? `; confidence ${trade.confidence}/10` : '';
    lines.push(`${indent}Plan: strategy ${strategy}; setup ${has(trade.setup) ? trade.setup : 'not recorded'}; tags ${tags}${confidence}${has(trade.quality_grade) ? `; quality grade ${trade.quality_grade}${has(trade.quality_score) ? ` (score ${Number(trade.quality_score).toFixed(0)})` : ''}` : ''}`);

    const risk = [
      has(trade.stop_loss) ? `stop ${price(trade.stop_loss)}` : 'stop not recorded',
      has(trade.take_profit) ? `target ${price(trade.take_profit)}` : 'target not recorded',
      has(trade.r_value) ? `${Number(trade.r_value).toFixed(2)}R` : null,
      has(trade.mae) ? `MAE ${money(trade.mae)}` : null,
      has(trade.mfe) ? `MFE ${money(trade.mfe)}` : null
    ].filter(Boolean).join('; ');
    lines.push(`${indent}Risk: ${risk}`);

    const postExit = this.postExitText(trade, currency);
    if (postExit) lines.push(`${indent}Excursion incl. post-exit window: ${postExit}`);

    const targets = this.targetText(trade, currency, timezone);
    if (targets) lines.push(`${indent}Targets: ${targets}`);

    const fills = this.parseExecutions(trade.executions);
    if (fills.length) {
      const shown = fills.slice(0, this.MAX_DETAIL_FILLS).map(fill => this.formatFill(fill, currency, timezone));
      lines.push(`${indent}Fills (${fills.length}${fills.length > shown.length ? `, first ${shown.length} shown` : ''}): ${shown.join('; ')}`);
    }

    const news = this.newsText(trade);
    if (news) lines.push(`${indent}News: ${news}`);

    const charts = this.toNumber(trade.chart_count);
    if (charts) lines.push(`${indent}Charts attached by the trader: ${charts} (images are not available to you)`);

    const notes = this.traderNotes(trade.notes, this.DETAIL_NOTES_CHARS);
    lines.push(`${indent}Notes: ${notes || 'none recorded'}`);
    return lines;
  }

  /**
   * post_exit_mae/mfe come from candles spanning ENTRY through exit + the
   * window (MAEEstimator.calculatePostExitFromCandleData), measured from the
   * entry price as positive whole-position amounts - not the move after the
   * exit alone. "Left on the table" mirrors excursionMetrics
   * missed_after_exit: that span's best favorable excursion minus the move
   * the exit captured.
   */
  static postExitText(trade, currency) {
    const has = value => value !== null && value !== undefined && value !== '';
    if (!has(trade.post_exit_mae) && !has(trade.post_exit_mfe)) return '';
    let metrics;
    try {
      metrics = buildExcursionMetrics(trade, null);
    } catch (error) {
      return '';
    }
    const money = value => currency.format(value);
    const minutes = this.toNumber(trade.post_exit_window_minutes);
    const span = `from entry through ${minutes ? `${minutes} min` : 'a window'} after exit, measured from the entry price, whole position`;
    const parts = [
      metrics.post_exit_mae !== null ? `max adverse ${money(metrics.post_exit_mae)}` : null,
      metrics.post_exit_mfe !== null ? `max favorable ${money(metrics.post_exit_mfe)}` : null
    ].filter(Boolean);
    const missed = metrics.missed_after_exit;
    // captured_move is clamped at 0, so on a loser "missed" is just the MFE.
    const left = missed === null || missed === undefined || !(metrics.captured_move > 0)
      ? ''
      : missed > 0
        ? `; best price in that span was worth ${money(missed)} more than the exit captured`
        : '; the exit captured the best price in that span';
    return `${parts.join(', ')} (${span})${left}`;
  }

  static TARGET_LABELS = { stop_loss: 'stop loss', take_profit: 'take profit' };

  static parseJsonArray(value) {
    let list = value;
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch (error) { return []; }
    }
    return Array.isArray(list) ? list.filter(item => item && typeof item === 'object') : [];
  }

  static targetText(trade, currency, timezone) {
    const has = value => value !== null && value !== undefined && value !== '';
    const price = value => this.priceText(currency, value);
    const parts = [];

    const ladder = this.parseJsonArray(trade.take_profit_targets).filter(target => has(target.price)).slice(0, 4);
    if (ladder.length) {
      parts.push(`target ladder ${ladder.map((target, index) => {
        const shares = this.toNumber(target.shares ?? target.quantity);
        const status = target.status && target.status !== 'pending' ? `, ${target.status}` : '';
        return `TP${target.order || index + 1} ${price(target.price)}${shares ? ` x${this.qty(shares)}` : ''}${status}`;
      }).join(', ')}`);
    }

    if (has(trade.manual_target_hit_first)) {
      parts.push(`trader marked ${this.TARGET_LABELS[trade.manual_target_hit_first] || trade.manual_target_hit_first} as hit first`);
    } else if (has(trade.target_hit_first)) {
      const label = trade.target_hit_first === 'none'
        ? 'neither stop nor target was reached'
        : `${trade.target_hit_label || this.TARGET_LABELS[trade.target_hit_first] || trade.target_hit_first} hit first`;
      const time = trade.target_hit_first !== 'none' ? this.localTime(trade.target_hit_time, timezone) : null;
      const inferred = String(trade.target_hit_inferred) === 'true' ? ', inferred from the exit price without candle data' : '';
      parts.push(`chart analysis: ${label}${time ? ` at ${time}` : ''}${inferred}`);
    }

    // R_VALUE_CALCULATIONS.md: Management R = Actual R - Planned R, where the
    // plan is -1R (stop first) or the weighted target R (target first).
    if (has(trade.management_r)) {
      const r = Number(trade.management_r);
      parts.push(`management R ${r >= 0 ? '+' : ''}${r.toFixed(2)}R (actual R minus the planned R for whichever level was hit first; positive means managed better than the plan)`);
    }
    return parts.join('; ');
  }

  static newsText(trade) {
    const count = this.toNumber(trade.news_count);
    if (!count) return '';
    const headlines = this.parseJsonArray(trade.news_headlines)
      .filter(item => item.headline)
      .map(item => `"${this.stripHtml(item.headline, 100)}"${item.datetime ? ` (${this.isoDate(item.datetime)})` : ''}`);
    return `${count} article${count === 1 ? '' : 's'} linked to the trade${trade.news_sentiment ? `, overall sentiment ${trade.news_sentiment}` : ''}${headlines.length ? `; latest: ${headlines.join('; ')}` : ''}`;
  }

  /**
   * Render best/worst detail entries under a heading. `scope` says which
   * statistic they back so the model does not pair an all-time trade with a
   * question about a narrower period.
   */
  static formatExtremeTrades(extremes, currency, heading) {
    const trades = extremes?.trades || [];
    if (!trades.length) return '';
    const timezone = extremes.timezone || 'UTC';
    const money = value => currency.format(value);
    const lines = [`${heading} (times in ${timezone}; "not recorded" means the trader left the field blank, so do not guess it):`];

    trades.forEach(entry => {
      const legs = entry.legs.slice(0, this.MAX_DETAIL_LEGS);
      const total = entry.legs.reduce((sum, leg) => sum + (this.toNumber(leg.pnl) || 0), 0);
      const stat = this.toNumber(entry.stat);
      lines.push(`- ${entry.labels.join(' and ')}${stat !== null ? ` (${stat >= 0 ? '+' : ''}${money(stat)})` : ''}:`);
      if (entry.legs.length > 1) {
        lines.push(`  Multi-leg position, ${entry.legs.length} legs, combined P&L ${money(total)}${legs.length < entry.legs.length ? `, first ${legs.length} legs shown` : ''}:`);
        legs.forEach((leg, index) => {
          lines.push(`  Leg ${index + 1}:`);
          lines.push(...this.formatTradeDetail(leg, currency, timezone, '    '));
        });
      } else {
        lines.push(...this.formatTradeDetail(legs[0], currency, timezone));
      }
      (entry.journal || []).forEach(journal => {
        const text = [
          journal.title ? `"${this.stripHtml(journal.title, 120)}"` : null,
          journal.content ? this.stripHtml(journal.content, this.DETAIL_JOURNAL_CHARS) : null,
          journal.lessons_learned ? `Lessons: ${this.stripHtml(journal.lessons_learned, 200)}` : null
        ].filter(Boolean).join(' | ');
        lines.push(`  Linked journal entry ${this.isoDate(journal.entry_date)}: ${text || '(empty)'}`);
      });
    });

    return lines.join('\n');
  }

  /**
   * Per-symbol focus: the user's own history on the symbol plus live quote,
   * company profile, recent news, and recent/upcoming earnings when Finnhub
   * is configured. Every market-data call is optional and time-boxed.
   */
  // ---------------------------------------------------------------------
  // Price history (performance over time, not just today's move)
  // ---------------------------------------------------------------------

  static PRICE_HISTORY_DAYS = 400;
  static PRICE_HISTORY_TIMEOUT_MS = 10000;
  static BENCHMARK_SYMBOL = 'SPY';
  static PRICE_PERIODS = [['1W', 7], ['1M', 30], ['3M', 91], ['6M', 182], ['YTD', null], ['1Y', 365]];
  // A base close further than this from its target date is too far off to
  // call it that period's return (stale or gappy series).
  static PRICE_BASE_MAX_GAP_DAYS = 5;

  static isoDay(date) {
    return date.toISOString().slice(0, 10);
  }

  static shiftDay(iso, days) {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return this.isoDay(date);
  }

  static dayGap(fromIso, toIso) {
    return Math.round((new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / 86400000);
  }

  /**
   * Daily closes for about the last year from the shared historical_prices
   * cache, backfilled from the market-data provider (Alpha Vantage fallback)
   * on a miss. Runs without a user id so chat does not spend the trader's
   * chart quota.
   */
  static async loadDailyCandles(symbol, days = this.PRICE_HISTORY_DAYS) {
    const PortfolioService = require('./portfolioService');
    const endDate = this.isoDay(new Date());
    const startDate = this.shiftDay(endDate, -days);
    return PortfolioService._getDailySeries(symbol, startDate, endDate, null, { allowAlphaVantageFallback: true });
  }

  /**
   * Multi-period performance from daily candles. Pure: candles in, stats out.
   * "Now" is the live quote when supplied (today's stored row is an intraday
   * snapshot and is replaced by it), otherwise the last stored close.
   * Weekend rows (some feeds repeat Friday) are dropped, missing highs/lows
   * fall back to the close, and a jump that looks like an unadjusted split
   * cuts the series so no return spans it.
   * @returns {Object|null} null when there is not enough history
   */
  static computePriceHistory(candles, { anchorPrice = null, anchorDate = null } = {}) {
    const byDate = new Map();
    for (const candle of candles || []) {
      const close = this.toNumber(candle?.close);
      const time = this.toNumber(candle?.time);
      if (close === null || close <= 0 || time === null) continue;
      const date = this.isoDay(new Date(time * 1000));
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      const high = this.toNumber(candle.high);
      const low = this.toNumber(candle.low);
      byDate.set(date, {
        date,
        close,
        high: high !== null && high > 0 ? high : close,
        low: low !== null && low > 0 ? low : close
      });
    }

    const price = this.toNumber(anchorPrice);
    const hasAnchor = price !== null && price > 0 && Boolean(anchorDate);
    let series = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (hasAnchor) series = series.filter(row => row.date < anchorDate);
    if (!series.length) return null;

    const anchor = hasAnchor
      ? { date: anchorDate, close: price, high: price, low: price }
      : series[series.length - 1];
    const base = hasAnchor ? series : series.slice(0, -1);
    if (!base.length) return null;

    // Unadjusted split (or bad print): a one-day move of more than ~80% up
    // or ~45% down. Keep only the part of the series after the last one.
    const points = [...base, anchor];
    let breakDate = null;
    for (let i = 1; i < points.length; i++) {
      const ratio = points[i].close / points[i - 1].close;
      if (ratio > 1.8 || ratio < 0.55) breakDate = points[i].date;
    }
    const usable = breakDate ? base.filter(row => row.date >= breakDate) : base;

    const closeOnOrBefore = (target, maxGap = this.PRICE_BASE_MAX_GAP_DAYS) => {
      let found = null;
      for (const row of usable) {
        if (row.date <= target) found = row;
        else break;
      }
      return found && this.dayGap(found.date, target) <= maxGap ? found : null;
    };

    const returns = [];
    for (const [label, days] of this.PRICE_PERIODS) {
      const target = days === null ? `${Number(anchor.date.slice(0, 4)) - 1}-12-31` : this.shiftDay(anchor.date, -days);
      const baseRow = closeOnOrBefore(target, days === null ? 7 : this.PRICE_BASE_MAX_GAP_DAYS);
      if (!baseRow) continue;
      returns.push({ label, pct: ((anchor.close / baseRow.close) - 1) * 100, base_date: baseRow.date, base_close: baseRow.close });
    }

    const yearAgo = this.shiftDay(anchor.date, -365);
    const window = [...usable.filter(row => row.date >= yearAgo), anchor];
    const highRow = window.reduce((best, row) => (row.high > best.high ? row : best), window[0]);
    const lowRow = window.reduce((best, row) => (row.low < best.low ? row : best), window[0]);
    const covers52w = usable.length > 0 && this.dayGap(usable[0].date, anchor.date) >= 330;

    const sma = n => (usable.length >= n
      ? usable.slice(-n).reduce((sum, row) => sum + row.close, 0) / n
      : null);
    const sma50 = sma(50);
    const sma200 = sma(200);

    const monthEnds = new Map();
    for (const row of usable) {
      const month = row.date.slice(0, 7);
      if (month < anchor.date.slice(0, 7)) monthEnds.set(month, row.close);
    }

    return {
      as_of: anchor.date,
      anchored_on_quote: hasAnchor,
      price: anchor.close,
      first_date: usable[0]?.date || null,
      last_close_date: base[base.length - 1].date,
      sessions: usable.length,
      break_date: breakDate,
      returns,
      range: {
        full_year: covers52w,
        high: highRow.high,
        high_date: highRow.date,
        low: lowRow.low,
        low_date: lowRow.date
      },
      sma50,
      sma200,
      month_ends: [...monthEnds.entries()].slice(-12).map(([month, close]) => ({ month, close }))
    };
  }

  // Finnhub /stock/metric figures, used when daily candles are unavailable.
  static METRIC_RETURN_KEYS = [
    ['5-day', '5DayPriceReturnDaily'],
    ['month-to-date', 'monthToDatePriceReturnDaily'],
    ['13-week', '13WeekPriceReturnDaily'],
    ['26-week', '26WeekPriceReturnDaily'],
    ['YTD', 'yearToDatePriceReturnDaily'],
    ['52-week', '52WeekPriceReturnDaily']
  ];
  static METRIC_RELATIVE_KEYS = [
    ['4-week', 'priceRelativeToS&P5004Week'],
    ['13-week', 'priceRelativeToS&P50013Week'],
    ['YTD', 'priceRelativeToS&P500Ytd'],
    ['52-week', 'priceRelativeToS&P50052Week']
  ];

  static summarizePriceMetrics(payload) {
    const metric = payload?.metric;
    if (!metric) return null;
    const pick = keys => keys
      .map(([label, key]) => ({ label, pct: this.toNumber(metric[key]) }))
      .filter(entry => entry.pct !== null);
    const returns = pick(this.METRIC_RETURN_KEYS);
    if (!returns.length) return null;
    return {
      returns,
      relative: pick(this.METRIC_RELATIVE_KEYS),
      high: this.toNumber(metric['52WeekHigh']),
      high_date: metric['52WeekHighDate'] || null,
      low: this.toNumber(metric['52WeekLow']),
      low_date: metric['52WeekLowDate'] || null,
      beta: this.toNumber(metric.beta)
    };
  }

  /** Benchmark (SPY) performance, loaded once per message for all symbols. */
  static async buildBenchmarkHistory(userId) {
    const symbol = this.BENCHMARK_SYMBOL;
    const [candles, quote] = await Promise.allSettled([
      this.withTimeout(this.loadDailyCandles(symbol), this.PRICE_HISTORY_TIMEOUT_MS),
      finnhub.isConfigured() ? this.withTimeout(finnhub.getQuote(symbol, userId)) : Promise.resolve(null)
    ]);
    if (candles.status !== 'fulfilled') return null;
    const q = quote.status === 'fulfilled' ? quote.value : null;
    const stats = this.computePriceHistory(candles.value, {
      anchorPrice: this.toNumber(q?.c),
      anchorDate: q?.t ? this.isoDay(new Date(q.t * 1000)) : null
    });
    return stats ? { symbol, ...stats } : null;
  }

  static async buildSymbolContext(userId, symbol, currency = null, scope = {}) {
    currency = currency || await AICurrency.forUser(userId);
    const context = { symbol, currency, trades: [], totals: null, journal: [], scope_label: null, market_data_available: finnhub.isConfigured() };

    // The user's history loads alongside the market data calls.
    const history = (async () => {
      try {
        const resolved = scope?.resolved ? scope : await this.resolveScope(userId, scope);
        context.scope_label = resolved.label || this.scopeLabel(resolved.accounts);
        const where = await this.scopedWhere(userId, resolved);
        const [trades, totals, journal] = await Promise.all([
          this.getUserSymbolTrades(userId, symbol, resolved, where),
          this.getUserSymbolTotals(userId, symbol, resolved, where).catch(error => {
            console.warn(`[AI_CHAT] Could not load totals for ${symbol}:`, error.message);
            return null;
          }),
          this.getSymbolJournal(userId, symbol, resolved, where).catch(error => {
            console.warn(`[AI_CHAT] Could not load journal entries for ${symbol}:`, error.message);
            return [];
          })
        ]);
        context.trades = this.rowsToDisplay(trades, this.SYMBOL_TRADE_MONEY_KEYS, currency);
        context.totals = totals ? { ...totals, total_pnl: currency.fromUsd(totals.total_pnl) } : null;
        context.journal = journal || [];
      } catch (error) {
        console.warn(`[AI_CHAT] Could not load trades for ${symbol}:`, error.message);
      }
    })();

    // Daily closes come from the shared cache (or a provider backfill), so
    // performance over time is available even without a live quote.
    const candlesLoad = this.withTimeout(this.loadDailyCandles(symbol), this.PRICE_HISTORY_TIMEOUT_MS)
      .catch(error => {
        console.warn(`[AI_CHAT] Could not load price history for ${symbol}:`, error.message);
        return [];
      });

    if (!context.market_data_available) {
      const [, candles] = await Promise.all([history, candlesLoad]);
      context.price_history = this.computePriceHistory(candles);
      return context.trades.length || context.price_history ? context : null;
    }

    const today = new Date();
    const daysFromToday = days => new Date(today.getTime() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [[quote, profile, news, earnings], , candles] = await Promise.all([
      Promise.allSettled([
        this.withTimeout(finnhub.getQuote(symbol, userId)),
        this.withTimeout(finnhub.getCompanyProfile(symbol, { userId })),
        this.withTimeout(finnhub.getCompanyNews(symbol, daysFromToday(-7), daysFromToday(0), { userId })),
        this.withTimeout(finnhub.getEarningsCalendar(daysFromToday(-60), daysFromToday(90), symbol))
      ]),
      history,
      candlesLoad
    ]);

    if (quote.status === 'fulfilled' && quote.value && this.toNumber(quote.value.c)) {
      context.quote = {
        price: quote.value.c,
        change: quote.value.d,
        change_percent: quote.value.dp,
        high: quote.value.h,
        low: quote.value.l,
        open: quote.value.o,
        previous_close: quote.value.pc,
        as_of: quote.value.t ? new Date(quote.value.t * 1000).toISOString() : null
      };
    }

    // Quotes are in the listing's trading currency; profile2 reports it.
    const quoteCurrency = String((profile.status === 'fulfilled' && profile.value?.currency) || 'USD').toUpperCase();

    if (profile.status === 'fulfilled' && profile.value?.name) {
      context.profile = {
        name: profile.value.name,
        industry: profile.value.finnhubIndustry,
        market_cap_millions: profile.value.marketCapitalization,
        currency: quoteCurrency
      };
    }

    if (context.quote) {
      context.quote.currency = quoteCurrency;
      try {
        await currency.ensureRates([quoteCurrency]);
      } catch (error) {
        console.warn(`[AI_CHAT] No ${quoteCurrency}/${currency.code} rate:`, error.message);
      }
      context.quote.price_display = currency.convert(context.quote.price, quoteCurrency);
    }

    context.price_history = this.computePriceHistory(candles, {
      anchorPrice: context.quote?.price ?? null,
      anchorDate: context.quote?.as_of ? context.quote.as_of.slice(0, 10) : null
    });
    if (!context.price_history?.returns?.length) {
      try {
        context.price_metrics = this.summarizePriceMetrics(await this.withTimeout(finnhub.getBasicFinancials(symbol)));
      } catch (error) {
        console.warn(`[AI_CHAT] Could not load price metrics for ${symbol}:`, error.message);
      }
    }

    if (news.status === 'fulfilled' && Array.isArray(news.value)) {
      context.news = news.value
        .slice()
        .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
        .slice(0, 6)
        .map(article => ({
          headline: article.headline,
          summary: this.stripHtml(article.summary, 300),
          source: article.source,
          datetime: article.datetime ? new Date(article.datetime * 1000).toISOString() : null
        }));
    }

    if (earnings.status === 'fulfilled' && Array.isArray(earnings.value)) {
      context.earnings = earnings.value
        .filter(entry => entry.symbol && entry.symbol.toUpperCase() === symbol)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(entry => ({
          date: entry.date,
          hour: entry.hour,
          quarter: entry.quarter,
          year: entry.year,
          eps_actual: entry.epsActual,
          eps_estimate: entry.epsEstimate,
          revenue_actual: entry.revenueActual,
          revenue_estimate: entry.revenueEstimate
        }));
    }

    // An unrecognized ticker-looking word with no trades and no market data
    // was almost certainly not a symbol; drop it so it doesn't pad the prompt.
    if (!context.trades.length && !context.quote && !context.profile && !context.price_history) return null;

    return context;
  }

  /**
   * @param {Object} [scope] - same shape as buildAccountContext's scope
   *   ({ accounts, timezone }); resolved once for all symbols.
   */
  static async buildSymbolContexts(userId, symbols, currency = null, scope = {}) {
    if (!symbols?.length) return [];
    const [resolvedCurrency, resolved] = await Promise.all([
      currency || AICurrency.forUser(userId),
      this.resolveScope(userId, scope).catch(() => ({ accounts: this.normalizeAccounts(scope?.accounts), timezone: 'UTC', position_grouping: false }))
    ]);
    currency = resolvedCurrency;
    const unique = [...new Set((symbols || []).map(symbol => String(symbol).toUpperCase()))]
      .slice(0, this.MAX_FOCUS_SYMBOLS);
    // One benchmark load per message, shared by every focus symbol, so
    // parallel contexts don't race the same SPY backfill.
    const benchmarkLoad = unique.includes(this.BENCHMARK_SYMBOL)
      ? Promise.resolve(null)
      : this.buildBenchmarkHistory(userId).catch(error => {
        console.warn('[AI_CHAT] Could not load benchmark history:', error.message);
        return null;
      });
    const [contexts, benchmark] = await Promise.all([
      Promise.all(unique.map(symbol =>
        this.buildSymbolContext(userId, symbol, currency, { ...resolved, resolved: true }).catch(error => {
          console.warn(`[AI_CHAT] Could not build context for ${symbol}:`, error.message);
          return null;
        })
      )),
      benchmarkLoad
    ]);
    return contexts.filter(Boolean).map(context => (benchmark ? { ...context, benchmark } : context));
  }

  static formatPosition(position, currency) {
    const money = value => currency.format(value);
    const instrument = position.instrument_type === 'option'
      ? ` ${position.underlying_symbol || ''} ${money(position.strike_price)} ${position.option_type || ''} exp ${this.isoDate(position.expiration_date)}`
      : '';
    const risk = [
      position.stop_loss ? `stop ${money(position.stop_loss)}` : null,
      position.take_profit ? `target ${money(position.take_profit)}` : null
    ].filter(Boolean).join(', ');
    const account = position.account_identifier ? ` [acct ${position.account_identifier}]` : '';
    const open = this.toNumber(position.open_quantity);
    const original = this.toNumber(position.quantity);
    const size = open !== null && original !== null && open !== original
      ? `${this.qty(open)} open (${this.qty(original)} originally)`
      : this.qty(position.quantity);
    return `- ${position.symbol}${instrument}: ${position.side} ${size} @ ${money(position.entry_price)} since ${this.isoDate(position.entry_time)}${risk ? ` (${risk})` : ''}${position.strategy ? `, strategy: ${position.strategy}` : ''}${account}`;
  }

  static formatStats(label, stats, currency) {
    if (!stats) return `${label}: unavailable`;
    const money = value => currency.format(value);
    return `${label}: ${stats.total_trades} trades, P&L ${money(stats.total_pnl)}, win rate ${this.percent(stats.win_rate)}, profit factor ${this.toNumber(stats.profit_factor)?.toFixed(2) ?? 'N/A'}, avg win ${money(stats.avg_win)}, avg loss ${money(stats.avg_loss)}, best ${money(stats.best_trade)}, worst ${money(stats.worst_trade)}, max drawdown ${money(stats.max_drawdown)}`;
  }

  static WEEKDAY_NAMES = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };

  static breakdownLabel(dimension, value) {
    if (dimension === 'entry_hour') {
      const hour = String(value).padStart(2, '0');
      return `${hour}:00-${hour}:59`;
    }
    if (dimension === 'weekday') return this.WEEKDAY_NAMES[value] || String(value);
    if (dimension === 'hold_bucket') return (this.HOLD_BUCKETS.find(([key]) => key === String(value)) || [])[1] || String(value);
    return this.stripHtml(value, 40);
  }

  static formatBreakdownRow(row, label, currency) {
    const trades = Number(row.trades) || 0;
    const rTrades = Number(row.r_trades) || 0;
    const win = this.toNumber(row.win_rate);
    const avgR = rTrades > 0 && this.toNumber(row.avg_r) !== null
      ? `, avg ${Number(row.avg_r).toFixed(2)}R${rTrades < trades ? ` (${rTrades} with R)` : ''}`
      : '';
    return `${label}: ${trades} trades, P&L ${currency.format(row.total_pnl)}, win ${win === null ? 'N/A' : `${win.toFixed(1)}%`}${avgR}${trades < this.SMALL_SAMPLE ? ' [small sample]' : ''}`;
  }

  /**
   * Compact per-dimension lines. Each dimension keeps its MAX_BREAKDOWN_ROWS
   * busiest groups; time dimensions are then shown in natural order.
   * Dimensions with fewer than two groups are skipped, except that missing
   * setups/tags are stated so the model does not invent them.
   */
  static formatBreakdowns(breakdowns, currency) {
    if (!breakdowns?.rows?.length) return [];
    const rows = breakdowns.rows;
    const total = rows.find(row => row.dimension === 'total');
    const totalTrades = Number(total?.trades) || 0;
    if (!totalTrades) return [];
    const timezone = breakdowns.timezone || 'UTC';
    const unit = breakdowns.position_grouping ? 'positions (multi-leg positions counted once)' : 'trades';
    const lines = [`PERFORMANCE BREAKDOWNS (${totalTrades} closed ${unit} in scope; win = share with P&L > 0; avg R only where R is recorded; [small sample] = under ${this.SMALL_SAMPLE} trades):`];

    const render = (dimension, title, groups, natural = false) => {
      const top = groups
        .slice()
        .sort((a, b) => (b.trades - a.trades) || String(a.value).localeCompare(String(b.value)))
        .slice(0, this.MAX_BREAKDOWN_ROWS);
      if (natural) top.sort((a, b) => Number(a.value) - Number(b.value));
      const more = groups.length > top.length ? ` (top ${top.length} of ${groups.length} by trade count)` : '';
      lines.push(`- ${title}${more}: ${top.map(row => this.formatBreakdownRow(row, this.breakdownLabel(dimension, row.value), currency)).join(' | ')}`);
    };
    const groupsOf = dimension => rows.filter(row => row.dimension === dimension && row.value !== null && row.value !== undefined);

    const setups = groupsOf('setup');
    const withSetup = setups.reduce((sum, row) => sum + Number(row.trades || 0), 0);
    if (setups.length >= 2) {
      render('setup', `By setup (${withSetup} of ${totalTrades} have one)`, setups);
    } else {
      lines.push(`- Setups: ${setups.length ? `only "${this.stripHtml(setups[0].value, 40)}" recorded (${withSetup} of ${totalTrades} trades)` : 'none recorded on any closed trade in scope'}`);
    }

    const tags = (breakdowns.tags || []).filter(row => row.value);
    const tagged = Number(total?.tagged_trades) || 0;
    if (tags.length >= 2) {
      render('tag', `By tag (${tagged} of ${totalTrades} tagged; a trade with several tags counts under each)`, tags);
    } else {
      lines.push(`- Tags: ${tags.length ? `only "${this.stripHtml(tags[0].value, 40)}" used (${tagged} of ${totalTrades} trades)` : 'none recorded on any closed trade in scope'}`);
    }

    [
      ['entry_hour', `By entry hour (${timezone})`, true],
      ['weekday', `By entry weekday (${timezone})`, true],
      ['hold_bucket', 'By hold time', true],
      ['side', 'By side', false],
      ['instrument_type', 'By instrument type', false]
    ].forEach(([dimension, title, natural]) => {
      const groups = groupsOf(dimension);
      if (groups.length >= 2) render(dimension, title, groups, natural);
    });

    return lines;
  }

  static formatAccountContext(context) {
    if (!context) return '';
    const currency = context.currency || new AICurrency('USD', { USD: 1 });
    const money = value => currency.format(value);
    const profile = context.profile;
    const lines = [currency.promptNote(), ''];

    // The shared trader dossier (declared + observed profile, tendencies,
    // personality, Edge Report, playbooks, risk limits, watchlists, holdings)
    // replaces the old settings-only profile block. The plain profile is the
    // fallback for callers that built context without a dossier.
    const dossierText = context.dossier ? AITraderContext.format(context.dossier, { currency }) : '';
    if (dossierText) {
      lines.push(dossierText);
      lines.push('');
    } else if (profile) {
      lines.push('TRADER PROFILE:');
      lines.push(`- Strategies: ${profile.trading_strategies?.join(', ') || 'Not specified'}`);
      lines.push(`- Styles: ${profile.trading_styles?.join(', ') || 'Not specified'}`);
      lines.push(`- Risk tolerance: ${profile.risk_tolerance || 'Not specified'}, experience: ${profile.experience_level || 'Not specified'}`);
      lines.push(`- Markets: ${profile.primary_markets?.join(', ') || 'Not specified'}; goals: ${profile.trading_goals?.join(', ') || 'Not specified'}; sectors: ${profile.preferred_sectors?.join(', ') || 'Not specified'}`);
      lines.push('');
    }

    // Placed after the dossier: AITraderContext is built journal-wide, so the
    // scope applies to the sections from here on only.
    const scope = context.scope || {};
    if (scope.label) {
      lines.push(`ACCOUNT SCOPE: ${scope.label}. The trader filtered the app to this scope; every figure from here on (performance, positions, breakdowns, trades) covers only it, while the trader dossier above is journal-wide. Say so when it matters to the answer.`);
    }
    if (scope.excluded_accounts?.length) {
      const names = scope.excluded_accounts
        .map(row => (row.account_name ? `${row.account_identifier} (${this.stripHtml(row.account_name, 60)})` : row.account_identifier))
        .join(', ');
      lines.push(`EXCLUDED ACCOUNTS: ${names} ${scope.excluded_accounts.length > 1 ? 'are' : 'is'} set to be left out of reports by the trader; no figure from here on includes ${scope.excluded_accounts.length > 1 ? 'them' : 'it'}.`);
    }
    if (scope.label || scope.excluded_accounts?.length) lines.push('');

    lines.push('PERFORMANCE OVERVIEW (closed trades):');
    lines.push(`- ${this.formatStats('All time', context.all_time, currency)}`);
    lines.push(`- ${this.formatStats('Last 30 days', context.last_30_days, currency)}`);
    lines.push('');

    const extremeText = this.formatExtremeTrades(context.extreme_trades, currency, 'TRADES BEHIND THE BEST / WORST FIGURES ABOVE');
    if (extremeText) {
      lines.push(extremeText);
      lines.push('');
    }

    const positions = context.open_positions || [];
    const quoted = positions.filter(position => this.toNumber(position.unrealized_pnl) !== null);
    lines.push(`OPEN POSITIONS (${positions.length}${quoted.length ? '; approx. unrealized P&L from last prices for stocks/ETFs/crypto, not options or futures' : ''}):`);
    lines.push(positions.length
      ? positions.map(position => `${this.formatPosition(position, currency)}${this.unrealizedText(
          this.toNumber(position.unrealized_pnl), this.toNumber(position.last_price), this.toNumber(position.entry_price), position.side, currency
        )}`).join('\n')
      : '- None');
    if (quoted.length > 1) {
      const combined = quoted.reduce((sum, position) => sum + Number(position.unrealized_pnl), 0);
      lines.push(`- Approx. combined unrealized P&L across the ${quoted.length} quoted positions: ${combined >= 0 ? '+' : ''}${money(combined)} (${combined >= 0 ? 'GAIN' : 'LOSS'})`);
    }
    lines.push('');

    lines.push('PERFORMANCE BY SYMBOL (most traded, closed trades):');
    lines.push(context.symbol_stats?.length
      ? context.symbol_stats.map(row => `- ${row.symbol}: ${row.trades} trades, P&L ${money(row.total_pnl)}, win rate ${this.percent(row.win_rate)}, last traded ${this.isoDate(row.last_traded)}`).join('\n')
      : '- No closed trades');
    lines.push('');

    const strategies = context.strategy_stats || [];
    const labeled = strategies.filter(row => row.strategy !== 'unlabeled');
    const labeledTrades = labeled.reduce((sum, row) => sum + Number(row.trades || 0), 0);
    const autoTrades = labeled.reduce((sum, row) => sum + Number(row.auto_trades || 0), 0);
    lines.push(autoTrades
      ? `PERFORMANCE BY STRATEGY (${autoTrades} of ${labeledTrades} labeled trades were auto-classified from hold time by the importer, not chosen by the trader; treat those labels as hold-time buckets, not plans):`
      : 'PERFORMANCE BY STRATEGY:');
    lines.push(strategies.length
      ? strategies.map(row => {
          const auto = Number(row.auto_trades || 0);
          const autoText = !auto ? '' : auto >= Number(row.trades) ? ', auto-classified' : `, ${auto} of these auto-classified`;
          return `- ${row.strategy}: ${row.trades} trades, P&L ${money(row.total_pnl)}, win rate ${this.percent(row.win_rate)}${autoText}`;
        }).join('\n')
      : '- No strategy data');
    lines.push('');

    const breakdownLines = this.formatBreakdowns(context.breakdowns, currency);
    if (breakdownLines.length) {
      lines.push(...breakdownLines);
      lines.push('');
    }

    lines.push('RECENT CLOSED TRADES:');
    lines.push(context.recent_trades?.length
      ? context.recent_trades.map(trade => {
          const quality = [
            trade.quality_grade ? `grade ${trade.quality_grade}` : null,
            trade.had_stop === false ? 'no stop' : null,
            this.toNumber(trade.mae) !== null ? `MAE ${money(trade.mae)}` : null,
            this.toNumber(trade.mfe) !== null ? `MFE ${money(trade.mfe)}` : null
          ].filter(Boolean).join(', ');
          const notes = this.traderNotes(trade.notes, 120);
          return `- ${this.isoDate(trade.exit_time || trade.entry_time)} ${trade.symbol} ${trade.side} ${this.qty(trade.quantity)} @ ${this.priceText(currency, trade.entry_price)} -> ${this.priceText(currency, trade.exit_price)}, P&L ${money(trade.pnl)}${trade.r_value !== null && trade.r_value !== undefined ? `, ${Number(trade.r_value).toFixed(2)}R` : ''}${trade.strategy ? `, ${trade.strategy}` : ''}${trade.setup ? `, setup: ${trade.setup}` : ''}${quality ? ` [${quality}]` : ''}${notes ? ` notes: ${notes}` : ''}`;
        }).join('\n')
      : '- None');
    lines.push('');

    lines.push('RECENT JOURNAL ENTRIES:');
    lines.push(context.journal_entries?.length
      ? context.journal_entries.map(entry => {
          const parts = [
            entry.title ? `"${this.stripHtml(entry.title, 120)}"` : null,
            entry.market_bias ? `bias: ${entry.market_bias}` : null,
            entry.followed_plan === true ? 'followed plan' : entry.followed_plan === false ? 'did not follow plan' : null,
            entry.content ? this.stripHtml(entry.content, 500) : null,
            entry.lessons_learned ? `Lessons: ${this.stripHtml(entry.lessons_learned, 250)}` : null
          ].filter(Boolean);
          return `- ${this.isoDate(entry.entry_date)} (${entry.entry_type}): ${parts.join(' | ')}`;
        }).join('\n')
      : '- None');

    return lines.join('\n');
  }

  static signedPercent(value) {
    const number = this.toNumber(value);
    return number === null ? 'N/A' : `${number >= 0 ? '+' : ''}${number.toFixed(1)}%`;
  }

  /**
   * Performance-over-time lines for a symbol focus. Percentages need no
   * conversion; price levels use the same listing-to-display conversion as
   * the quote line (or stay in the listing currency, labeled, without a rate).
   */
  static formatPriceHistory(context, currency, quoteCode) {
    const rate = quoteCode !== currency.code ? currency.rateFrom(quoteCode) : 1;
    const level = value => {
      const number = this.toNumber(value);
      if (number === null) return 'N/A';
      const converted = rate !== null ? number * rate : number;
      // Cents for normal prices; sub-dollar listings keep more precision.
      if (Math.abs(converted) < 1) return rate !== null ? this.priceText(currency, converted) : currency.format(converted, quoteCode);
      return rate !== null ? currency.format(converted) : currency.format(converted, quoteCode);
    };
    const history = context.price_history;
    const lines = [];

    if (history?.returns?.length) {
      const now = history.anchored_on_quote
        ? `now = live quote as of ${history.as_of}`
        : `now = last close on ${history.as_of}`;
      lines.push(`- Price performance (daily closes from ${history.first_date}; ${now}): ${history.returns.map(r => `${r.label} ${this.signedPercent(r.pct)}`).join(', ')}`);

      const benchmark = context.benchmark;
      if (benchmark?.returns?.length) {
        const byLabel = new Map(benchmark.returns.map(r => [r.label, r.pct]));
        const pairs = history.returns
          .filter(r => byLabel.has(r.label))
          .map(r => `${r.label} ${this.signedPercent(byLabel.get(r.label))} (${context.symbol} ${r.pct - byLabel.get(r.label) >= 0 ? 'ahead by' : 'behind by'} ${Math.abs(r.pct - byLabel.get(r.label)).toFixed(1)} pts)`);
        if (pairs.length) lines.push(`- S&P 500 (${benchmark.symbol}) over the same periods: ${pairs.join(', ')}`);
      }

      const range = history.range;
      const fromHigh = ((history.price / range.high) - 1) * 100;
      const fromLow = ((history.price / range.low) - 1) * 100;
      lines.push(`- ${range.full_year ? '52-week' : `Range since ${history.first_date}`}: low ${level(range.low)} (${range.low_date}), high ${level(range.high)} (${range.high_date}); now ${Math.abs(fromHigh).toFixed(1)}% ${fromHigh <= 0 ? 'below' : 'above'} the high and ${Math.abs(fromLow).toFixed(1)}% above the low`);

      // Spell out which side the price is on: a bare "(29% below)" next to
      // the average was read backwards by smaller models.
      const versus = (label, average) => `the current price is ${Math.abs(((history.price / average) - 1) * 100).toFixed(1)}% ${history.price >= average ? 'ABOVE' : 'BELOW'} its ${label} average of ${level(average)}`;
      const averages = [
        history.sma50 !== null ? versus('50-day', history.sma50) : null,
        history.sma200 !== null ? versus('200-day', history.sma200) : null
      ].filter(Boolean);
      if (averages.length) lines.push(`- Moving averages of daily closes: ${averages.join('; ')}`);

      if (history.month_ends.length >= 3) {
        lines.push(`- Month-end closes: ${history.month_ends.map(m => `${m.month} ${level(m.close)}`).join(', ')}`);
      }
      if (history.break_date) {
        lines.push(`- Note: prices before ${history.break_date} are left out because the series jumps there (likely a stock split), so no figure above spans that date.`);
      }
      return lines;
    }

    const metrics = context.price_metrics;
    if (metrics?.returns?.length) {
      lines.push(`- Price performance (computed by the market data provider): ${metrics.returns.map(r => `${r.label} ${this.signedPercent(r.pct)}`).join(', ')}`);
      if (metrics.relative.length) {
        lines.push(`- Relative to the S&P 500 (percentage points): ${metrics.relative.map(r => `${r.label} ${this.signedPercent(r.pct).replace('%', ' pts')}`).join(', ')}`);
      }
      if (metrics.high !== null && metrics.low !== null) {
        lines.push(`- 52-week range: low ${level(metrics.low)}${metrics.low_date ? ` (${metrics.low_date})` : ''}, high ${level(metrics.high)}${metrics.high_date ? ` (${metrics.high_date})` : ''}${metrics.beta !== null ? `; beta ${metrics.beta.toFixed(2)}` : ''}`);
      }
      return lines;
    }

    if (context.quote || context.market_data_available) {
      lines.push("- Price history: not available right now. Today's change is not the stock's performance over time; if asked how it has performed, say longer-term price history was not available.");
    }
    return lines;
  }

  static formatSymbolContexts(contexts) {
    if (!contexts?.length) return '';

    return contexts.map(context => {
      const currency = context.currency || new AICurrency('USD', { USD: 1 });
      const money = value => currency.format(value);
      const quote = context.quote;
      const quoteCode = quote?.currency || context.profile?.currency || 'USD';
      const quoteMoney = value => currency.format(value, quoteCode);
      const lines = [`SYMBOL FOCUS: ${context.symbol}${context.profile?.name ? ` (${context.profile.name})` : ''}${context.scope_label ? ` [${context.scope_label}]` : ''}`];

      if (context.profile) {
        lines.push(`- Industry: ${context.profile.industry || 'N/A'}, market cap: ${context.profile.market_cap_millions ? `${Math.round(context.profile.market_cap_millions).toLocaleString('en-US')}M ${quoteCode}` : 'N/A'}`);
      }

      if (quote) {
        // When the listing trades in another currency, state every quote
        // figure converted: a lone converted price next to native figures
        // led models to relabel the native ones.
        const quoteRate = quoteCode !== currency.code ? currency.rateFrom(quoteCode) : null;
        const priceMoney = quoteRate !== null
          ? value => money(this.toNumber(value) === null ? null : Number(value) * quoteRate)
          : quoteMoney;
        const label = quoteRate !== null
          ? `Quote converted to ${currency.code} (trades in ${quoteCode}, native last price ${quoteMoney(quote.price)})`
          : `Quote in ${quoteCode}`;
        lines.push(`- ${label}${quote.as_of ? ` as of ${quote.as_of}` : ''}: ${priceMoney(quote.price)}, change ${this.toNumber(quote.change) >= 0 ? '+' : ''}${priceMoney(quote.change)} (${this.percent(quote.change_percent)}), day range ${priceMoney(quote.low)}-${priceMoney(quote.high)}, previous close ${priceMoney(quote.previous_close)}`);
      } else if (!context.market_data_available) {
        lines.push('- Live market data is not configured on this server (no quote, news, or earnings available).');
      }

      lines.push(...this.formatPriceHistory(context, currency, quoteCode));

      const openTrades = context.trades.filter(trade => trade.exit_price === null || trade.exit_price === undefined);
      const closedTrades = context.trades.filter(trade => trade.exit_price !== null && trade.exit_price !== undefined);

      lines.push(`- User's open positions in ${context.symbol}: ${openTrades.length || 'none'}`);
      openTrades.forEach(trade => {
        // Both sides are in the display currency: the quote converted from
        // its trading currency, the entry converted from storage.
        const lastPrice = quote?.price_display ?? null;
        const entryPrice = this.toNumber(trade.entry_price);
        const unrealized = lastPrice !== null && trade.instrument_type !== 'option' && entryPrice !== null
          ? (lastPrice - entryPrice) * Number(trade.quantity || 0) * (trade.side === 'short' ? -1 : 1)
          : null;
        const unrealizedText = this.unrealizedText(unrealized, lastPrice, entryPrice, trade.side, currency);
        lines.push(`  ${this.formatPosition(trade, currency).slice(2)}${unrealizedText}${trade.notes ? `, notes: ${this.stripHtml(trade.notes, 200)}` : ''}`);
      });

      const totals = context.totals;
      if (totals && Number(totals.trades) > 0) {
        const totalR = Number(totals.r_trades) > 0 && this.toNumber(totals.avg_r) !== null
          ? `, avg ${Number(totals.avg_r).toFixed(2)}R over ${totals.r_trades} trades with R`
          : '';
        lines.push(`- User's closed trades in ${context.symbol} (ALL closed trades in scope): ${totals.trades} trades, total P&L ${money(totals.total_pnl)}, win rate ${this.percent(totals.win_rate)}${totalR}, first traded ${this.isoDate(totals.first_traded)}, last traded ${this.isoDate(totals.last_traded)}`);
      } else if (totals) {
        lines.push(`- User's closed trades in ${context.symbol}: none`);
      } else if (closedTrades.length) {
        const samplePnl = closedTrades.reduce((sum, trade) => sum + (this.toNumber(trade.pnl) || 0), 0);
        lines.push(`- User's closed trades in ${context.symbol}: totals unavailable; the ${closedTrades.length} most recent below sum to ${money(samplePnl)}`);
      }
      if (closedTrades.length) {
        lines.push(`- Most recent ${closedTrades.length} closed trades in ${context.symbol}:`);
        closedTrades.forEach(trade => {
          const auto = trade.strategy && trade.manual_override === false && trade.classification_method && trade.classification_method !== 'manual';
          const notes = this.traderNotes(trade.notes, 120);
          const parts = [
            `P&L ${money(trade.pnl)}`,
            this.toNumber(trade.r_value) !== null ? `${Number(trade.r_value).toFixed(2)}R` : null,
            trade.setup ? `setup: ${this.stripHtml(trade.setup, 60)}` : null,
            trade.strategy ? `${trade.strategy}${auto ? ' (auto)' : ''}` : null,
            trade.had_stop === false ? 'no stop' : null,
            notes ? `notes: ${notes}` : null
          ].filter(Boolean).join(', ');
          lines.push(`  - ${this.isoDate(trade.exit_time || trade.entry_time)} ${trade.side} ${this.qty(trade.quantity)} @ ${money(trade.entry_price)} -> ${money(trade.exit_price)}, ${parts}`);
        });
      }
      if (context.journal?.length) {
        lines.push(`- Journal entries linked to ${context.symbol} trades:`);
        context.journal.forEach(entry => {
          const text = [
            entry.title ? `"${this.stripHtml(entry.title, 120)}"` : null,
            entry.content ? this.stripHtml(entry.content, 250) : null,
            entry.lessons_learned ? `Lessons: ${this.stripHtml(entry.lessons_learned, 150)}` : null
          ].filter(Boolean).join(' | ');
          lines.push(`  - ${this.isoDate(entry.entry_date)}: ${text || '(empty)'}`);
        });
      }

      if (context.earnings?.length) {
        lines.push('- Earnings (recent and upcoming):');
        context.earnings.forEach(entry => {
          const reported = entry.eps_actual !== null && entry.eps_actual !== undefined;
          const surprise = reported && this.toNumber(entry.eps_estimate)
            ? ` (${entry.eps_actual >= entry.eps_estimate ? 'beat' : 'missed'} by ${Math.abs(((entry.eps_actual - entry.eps_estimate) / Math.abs(entry.eps_estimate)) * 100).toFixed(1)}%)`
            : '';
          lines.push(`  - ${entry.date}${entry.hour ? ` ${entry.hour}` : ''} Q${entry.quarter || '?'} ${entry.year || ''}: EPS (${quoteCode}) ${reported ? entry.eps_actual : 'not yet reported'} vs est ${entry.eps_estimate ?? 'N/A'}${surprise}; revenue ${this.bigMoney(entry.revenue_actual, quoteCode) ?? 'not yet reported'} vs est ${this.bigMoney(entry.revenue_estimate, quoteCode) ?? 'N/A'}`);
        });
      } else if (context.market_data_available) {
        lines.push('- Earnings: none found in the last 60 / next 90 days');
      }

      if (context.news?.length) {
        lines.push('- News (last 7 days):');
        context.news.forEach(article => {
          lines.push(`  - ${article.datetime ? this.isoDate(article.datetime) : 'N/A'} ${article.source || ''}: ${article.headline}${article.summary ? ` - ${article.summary}` : ''}`);
        });
      } else if (context.market_data_available) {
        lines.push('- News: no articles found in the last 7 days');
      }

      return lines.join('\n');
    }).join('\n\n');
  }
}

module.exports = AIChatContext;
