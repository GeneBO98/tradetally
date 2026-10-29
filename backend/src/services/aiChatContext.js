const db = require('../config/database');
const TradeQueries = require('./tradeQueries');
const finnhub = require('../utils/finnhubClient');
const { fxUsd } = require('../utils/tradeFx');
const AICurrency = require('./aiCurrency');
const AITraderContext = require('./aiTraderContext');

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

  // getAnalytics aggregates are USD-normalized; convert the money fields.
  static summarizeAnalytics(analytics, currency) {
    const summary = analytics?.summary || {};
    return {
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
   */
  static async buildAccountContext(userId, currency = null) {
    currency = currency || await AICurrency.forUser(userId);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const settle = async (label, promise, fallback) => {
      try {
        return await promise;
      } catch (error) {
        console.warn(`[AI_CHAT] Could not load ${label}:`, error.message);
        return fallback;
      }
    };

    const [allTime, lastThirty, openPositions, symbolStats, strategyStats, recentTrades, journal, profile, dossier] = await Promise.all([
      settle('all-time analytics', TradeQueries.getAnalytics(userId, {}), null),
      settle('30-day analytics', TradeQueries.getAnalytics(userId, { startDate: thirtyDaysAgo }), null),
      settle('open positions', db.query(
        `SELECT symbol, underlying_symbol, side, quantity, ${usd('entry_price')}, entry_time,
                instrument_type, option_type, ${usd('strike_price')}, expiration_date,
                account_identifier, broker, ${usd('stop_loss')}, ${usd('take_profit')}, strategy, setup, notes
         FROM trades
         WHERE user_id = $1 AND entry_price IS NOT NULL AND exit_price IS NULL
         ORDER BY entry_time DESC
         LIMIT 40`,
        [userId]
      ).then(result => result.rows), []),
      settle('symbol stats', db.query(
        `SELECT UPPER(COALESCE(NULLIF(underlying_symbol, ''), symbol)) AS symbol,
                COUNT(*)::int AS trades,
                COALESCE(SUM(${fxUsd('pnl', '')}), 0) AS total_pnl,
                AVG(CASE WHEN pnl > 0 THEN 100.0 ELSE 0 END) AS win_rate,
                MAX(COALESCE(exit_time, entry_time)) AS last_traded
         FROM trades
         WHERE user_id = $1 AND exit_price IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, SUM(${fxUsd('pnl', '')}) DESC
         LIMIT 15`,
        [userId]
      ).then(result => result.rows), []),
      settle('strategy stats', db.query(
        `SELECT COALESCE(NULLIF(strategy, ''), 'unlabeled') AS strategy,
                COUNT(*)::int AS trades,
                COALESCE(SUM(${fxUsd('pnl', '')}), 0) AS total_pnl,
                AVG(CASE WHEN pnl > 0 THEN 100.0 ELSE 0 END) AS win_rate
         FROM trades
         WHERE user_id = $1 AND exit_price IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC
         LIMIT 10`,
        [userId]
      ).then(result => result.rows), []),
      settle('recent trades', db.query(
        `SELECT symbol, side, quantity, ${usd('entry_price')}, ${usd('exit_price')}, entry_time, exit_time,
                ${usd('pnl')}, r_value, strategy, instrument_type, quality_grade,
                ${usd('mae')}, ${usd('mfe')}, stop_loss IS NOT NULL AS had_stop
         FROM trades
         WHERE user_id = $1 AND exit_price IS NOT NULL
         ORDER BY exit_time DESC NULLS LAST, entry_time DESC
         LIMIT 15`,
        [userId]
      ).then(result => result.rows), []),
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

    return {
      generated_at: new Date().toISOString(),
      currency,
      profile,
      dossier,
      all_time: allTime ? this.summarizeAnalytics(allTime, currency) : null,
      last_30_days: lastThirty ? this.summarizeAnalytics(lastThirty, currency) : null,
      open_positions: this.rowsToDisplay(openPositions, ['entry_price', 'strike_price', 'stop_loss', 'take_profit'], currency),
      symbol_stats: this.rowsToDisplay(symbolStats, ['total_pnl'], currency),
      strategy_stats: this.rowsToDisplay(strategyStats, ['total_pnl'], currency),
      recent_trades: this.rowsToDisplay(recentTrades, ['entry_price', 'exit_price', 'pnl', 'mae', 'mfe'], currency),
      journal_entries: journal
    };
  }

  static SYMBOL_TRADE_MONEY_KEYS = ['entry_price', 'exit_price', 'pnl', 'stop_loss', 'take_profit', 'strike_price'];

  static async getUserSymbolTrades(userId, symbol) {
    const result = await db.query(
      `SELECT symbol, side, quantity, ${usd('entry_price')}, ${usd('exit_price')}, entry_time, exit_time, ${usd('pnl')},
              r_value, ${usd('stop_loss')}, ${usd('take_profit')}, strategy, setup, notes, instrument_type,
              option_type, ${usd('strike_price')}, expiration_date, account_identifier
       FROM trades
       WHERE user_id = $1
         AND (UPPER(symbol) = $2 OR UPPER(underlying_symbol) = $2)
       ORDER BY (exit_price IS NULL) DESC, entry_time DESC
       LIMIT 25`,
      [userId, symbol]
    );
    return result.rows;
  }

  /**
   * Per-symbol focus: the user's own history on the symbol plus live quote,
   * company profile, recent news, and recent/upcoming earnings when Finnhub
   * is configured. Every market-data call is optional and time-boxed.
   */
  static async buildSymbolContext(userId, symbol, currency = null) {
    currency = currency || await AICurrency.forUser(userId);
    const context = { symbol, currency, trades: [], market_data_available: finnhub.isConfigured() };

    try {
      context.trades = this.rowsToDisplay(await this.getUserSymbolTrades(userId, symbol), this.SYMBOL_TRADE_MONEY_KEYS, currency);
    } catch (error) {
      console.warn(`[AI_CHAT] Could not load trades for ${symbol}:`, error.message);
    }

    if (!context.market_data_available) return context.trades.length ? context : null;

    const today = new Date();
    const daysFromToday = days => new Date(today.getTime() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [quote, profile, news, earnings] = await Promise.allSettled([
      this.withTimeout(finnhub.getQuote(symbol, userId)),
      this.withTimeout(finnhub.getCompanyProfile(symbol, { userId })),
      this.withTimeout(finnhub.getCompanyNews(symbol, daysFromToday(-7), daysFromToday(0), { userId })),
      this.withTimeout(finnhub.getEarningsCalendar(daysFromToday(-60), daysFromToday(90), symbol))
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
    if (!context.trades.length && !context.quote && !context.profile) return null;

    return context;
  }

  static async buildSymbolContexts(userId, symbols, currency = null) {
    if (!symbols?.length) return [];
    currency = currency || await AICurrency.forUser(userId);
    const unique = [...new Set((symbols || []).map(symbol => String(symbol).toUpperCase()))]
      .slice(0, this.MAX_FOCUS_SYMBOLS);
    const contexts = await Promise.all(unique.map(symbol =>
      this.buildSymbolContext(userId, symbol, currency).catch(error => {
        console.warn(`[AI_CHAT] Could not build context for ${symbol}:`, error.message);
        return null;
      })
    ));
    return contexts.filter(Boolean);
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
    return `- ${position.symbol}${instrument}: ${position.side} ${this.qty(position.quantity)} @ ${money(position.entry_price)} since ${this.isoDate(position.entry_time)}${risk ? ` (${risk})` : ''}${position.strategy ? `, strategy: ${position.strategy}` : ''}${account}`;
  }

  static formatStats(label, stats, currency) {
    if (!stats) return `${label}: unavailable`;
    const money = value => currency.format(value);
    return `${label}: ${stats.total_trades} trades, P&L ${money(stats.total_pnl)}, win rate ${this.percent(stats.win_rate)}, profit factor ${this.toNumber(stats.profit_factor)?.toFixed(2) ?? 'N/A'}, avg win ${money(stats.avg_win)}, avg loss ${money(stats.avg_loss)}, best ${money(stats.best_trade)}, worst ${money(stats.worst_trade)}, max drawdown ${money(stats.max_drawdown)}`;
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

    lines.push('PERFORMANCE OVERVIEW (closed trades):');
    lines.push(`- ${this.formatStats('All time', context.all_time, currency)}`);
    lines.push(`- ${this.formatStats('Last 30 days', context.last_30_days, currency)}`);
    lines.push('');

    lines.push(`OPEN POSITIONS (${context.open_positions?.length || 0}):`);
    lines.push(context.open_positions?.length
      ? context.open_positions.map(position => this.formatPosition(position, currency)).join('\n')
      : '- None');
    lines.push('');

    lines.push('PERFORMANCE BY SYMBOL (most traded, closed trades):');
    lines.push(context.symbol_stats?.length
      ? context.symbol_stats.map(row => `- ${row.symbol}: ${row.trades} trades, P&L ${money(row.total_pnl)}, win rate ${this.percent(row.win_rate)}, last traded ${this.isoDate(row.last_traded)}`).join('\n')
      : '- No closed trades');
    lines.push('');

    lines.push('PERFORMANCE BY STRATEGY:');
    lines.push(context.strategy_stats?.length
      ? context.strategy_stats.map(row => `- ${row.strategy}: ${row.trades} trades, P&L ${money(row.total_pnl)}, win rate ${this.percent(row.win_rate)}`).join('\n')
      : '- No strategy data');
    lines.push('');

    lines.push('RECENT CLOSED TRADES:');
    lines.push(context.recent_trades?.length
      ? context.recent_trades.map(trade => {
          const quality = [
            trade.quality_grade ? `grade ${trade.quality_grade}` : null,
            trade.had_stop === false ? 'no stop' : null,
            this.toNumber(trade.mae) !== null ? `MAE ${money(trade.mae)}` : null,
            this.toNumber(trade.mfe) !== null ? `MFE ${money(trade.mfe)}` : null
          ].filter(Boolean).join(', ');
          return `- ${this.isoDate(trade.exit_time || trade.entry_time)} ${trade.symbol} ${trade.side} ${this.qty(trade.quantity)} @ ${money(trade.entry_price)} -> ${money(trade.exit_price)}, P&L ${money(trade.pnl)}${trade.r_value !== null && trade.r_value !== undefined ? `, ${Number(trade.r_value).toFixed(2)}R` : ''}${trade.strategy ? `, ${trade.strategy}` : ''}${quality ? ` [${quality}]` : ''}`;
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

  static formatSymbolContexts(contexts) {
    if (!contexts?.length) return '';

    return contexts.map(context => {
      const currency = context.currency || new AICurrency('USD', { USD: 1 });
      const money = value => currency.format(value);
      const quote = context.quote;
      const quoteCode = quote?.currency || context.profile?.currency || 'USD';
      const quoteMoney = value => currency.format(value, quoteCode);
      const lines = [`SYMBOL FOCUS: ${context.symbol}${context.profile?.name ? ` (${context.profile.name})` : ''}`];

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

      const openTrades = context.trades.filter(trade => trade.exit_price === null || trade.exit_price === undefined);
      const closedTrades = context.trades.filter(trade => trade.exit_price !== null && trade.exit_price !== undefined);
      const closedPnl = closedTrades.reduce((sum, trade) => sum + (this.toNumber(trade.pnl) || 0), 0);

      lines.push(`- User's open positions in ${context.symbol}: ${openTrades.length || 'none'}`);
      openTrades.forEach(trade => {
        // Both sides are in the display currency: the quote converted from
        // its trading currency, the entry converted from storage.
        const lastPrice = quote?.price_display ?? null;
        const entryPrice = this.toNumber(trade.entry_price);
        const unrealized = lastPrice !== null && trade.instrument_type !== 'option' && entryPrice !== null
          ? (lastPrice - entryPrice) * Number(trade.quantity || 0) * (trade.side === 'short' ? -1 : 1)
          : null;
        // Spell out gain vs loss and the price comparison: smaller models
        // misread a bare signed number as the wrong direction.
        const unrealizedText = unrealized === null
          ? ''
          : `, approx. unrealized P&L ${unrealized >= 0 ? '+' : ''}${money(unrealized)} (${unrealized >= 0 ? 'GAIN' : 'LOSS'}: last price ${money(lastPrice)} is ${lastPrice >= entryPrice ? 'above' : 'below'} the ${money(entryPrice)} entry on a ${trade.side} position)`;
        lines.push(`  ${this.formatPosition(trade, currency).slice(2)}${unrealizedText}${trade.notes ? `, notes: ${this.stripHtml(trade.notes, 200)}` : ''}`);
      });
      lines.push(`- User's closed trades in ${context.symbol}: ${closedTrades.length} most recent, combined P&L ${money(closedPnl)}`);
      closedTrades.slice(0, 10).forEach(trade => {
        lines.push(`  - ${this.isoDate(trade.exit_time || trade.entry_time)} ${trade.side} ${this.qty(trade.quantity)} @ ${money(trade.entry_price)} -> ${money(trade.exit_price)}, P&L ${money(trade.pnl)}${trade.strategy ? `, ${trade.strategy}` : ''}`);
      });

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
