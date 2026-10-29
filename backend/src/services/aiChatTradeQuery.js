const db = require('../config/database');
const TradeQueries = require('./tradeQueries');
const AIChatContext = require('./aiChatContext');
const AIProvider = require('../utils/aiProvider');

/**
 * AI Chat Trade Query
 *
 * Turns a chat message like "show me my losing AAPL trades last month" into
 * a trade filter, runs it through the canonical TradeQueries filter builder,
 * and renders the matching trades plus their aggregate stats as a prompt
 * section. This is what lets the assistant answer questions about trades
 * that fall outside the fixed "recent / most traded" snapshot.
 *
 * Two extractors feed the filter:
 * - a deterministic parser (dates, outcome words, side, instrument, grades,
 *   known strategies / setups / tags / symbols) that always runs, and
 * - when the admin has enabled the cheap follow-up classifier model, a JSON
 *   extraction call that catches phrasings the parser misses. Its output is
 *   validated against the same vocabulary before it can touch the query.
 */
class AIChatTradeQuery {
  static MAX_TRADES_IN_PROMPT = 20;
  static MAX_KNOWN_TERMS = 60;
  static EXTRACTION_MAX_CHARS = 1200;

  static MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  static MONTH_PATTERN = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  static DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  static INSTRUMENT_WORDS = [
    [/\b(options?|calls?|puts?|spreads?|iron condors?)\b/i, 'option'],
    [/\b(futures?|contracts?|es|nq|mes|mnq)\b/i, 'future'],
    [/\b(forex|fx|currency pairs?)\b/i, 'forex'],
    [/\b(crypto|bitcoin|btc|eth|ethereum)\b/i, 'crypto'],
    [/\b(stocks?|equities|shares)\b/i, 'stock']
  ];

  // ---------------------------------------------------------------------
  // Date helpers (all on YYYY-MM-DD strings, no timezone math after today)
  // ---------------------------------------------------------------------

  static todayIn(timezone) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (error) {
      return new Date().toISOString().split('T')[0];
    }
  }

  static toDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  static toIso(date) {
    return date.toISOString().split('T')[0];
  }

  static addDays(iso, days) {
    const date = this.toDate(iso);
    date.setUTCDate(date.getUTCDate() + days);
    return this.toIso(date);
  }

  static monthRange(year, monthIndex) {
    const start = new Date(Date.UTC(year, monthIndex, 1));
    const end = new Date(Date.UTC(year, monthIndex + 1, 0));
    return { startDate: this.toIso(start), endDate: this.toIso(end) };
  }

  static monthIndex(word) {
    const key = word.toLowerCase().slice(0, 3);
    return this.MONTHS.findIndex(name => name.startsWith(key));
  }

  static formatRangeLabel(startDate, endDate) {
    const fmt = iso => {
      const date = this.toDate(iso);
      return `${this.MONTHS[date.getUTCMonth()].slice(0, 3).replace(/^./, c => c.toUpperCase())} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
    };
    if (startDate && endDate) return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} to ${fmt(endDate)}`;
    if (startDate) return `since ${fmt(startDate)}`;
    if (endDate) return `through ${fmt(endDate)}`;
    return null;
  }

  /**
   * Resolve a date phrase in the message to a range. Returns null when the
   * message has no recognizable time reference.
   */
  static parseDateRange(message, today) {
    const text = String(message || '').toLowerCase();
    const t = this.toDate(today);
    const year = t.getUTCFullYear();
    const month = t.getUTCMonth();
    const dow = t.getUTCDay(); // 0 = Sunday
    let match;

    if (/\btoday\b/.test(text)) return { startDate: today, endDate: today };
    if (/\byesterday\b/.test(text)) { const d = this.addDays(today, -1); return { startDate: d, endDate: d }; }

    if (/\bthis week\b/.test(text)) {
      const monday = this.addDays(today, -((dow + 6) % 7));
      return { startDate: monday, endDate: today };
    }
    if (/\blast week\b/.test(text)) {
      const monday = this.addDays(today, -((dow + 6) % 7) - 7);
      return { startDate: monday, endDate: this.addDays(monday, 6) };
    }
    if (/\bthis month\b/.test(text)) {
      return { startDate: this.toIso(new Date(Date.UTC(year, month, 1))), endDate: today };
    }
    if (/\blast month\b/.test(text)) {
      return this.monthRange(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1);
    }
    if (/\b(this year|ytd|year to date)\b/.test(text)) {
      return { startDate: `${year}-01-01`, endDate: today };
    }
    if (/\blast year\b/.test(text)) {
      return { startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` };
    }
    if (/\b(this|last|past) quarter\b/.test(text)) {
      const q = Math.floor(month / 3);
      const shift = /\bthis quarter\b/.test(text) ? 0 : 1;
      const qi = q - shift;
      const qYear = qi < 0 ? year - 1 : year;
      const qStart = ((qi % 4) + 4) % 4;
      const start = this.toIso(new Date(Date.UTC(qYear, qStart * 3, 1)));
      const end = shift === 0 ? today : this.toIso(new Date(Date.UTC(qYear, qStart * 3 + 3, 0)));
      return { startDate: start, endDate: end };
    }

    match = text.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+(day|week|month)s?\b/);
    if (match) {
      const n = parseInt(match[1], 10);
      const unit = match[2];
      const days = unit === 'day' ? n : unit === 'week' ? n * 7 : n * 30;
      return { startDate: this.addDays(today, -(days - 1)), endDate: today };
    }
    match = text.match(/\b(?:last|past)\s+(few|couple of|couple)\s+(day|week|month)s\b/);
    if (match) {
      const n = match[1] === 'few' ? 3 : 2;
      const days = match[2] === 'day' ? n : match[2] === 'week' ? n * 7 : n * 30;
      return { startDate: this.addDays(today, -(days - 1)), endDate: today };
    }

    match = text.match(/\bq([1-4])(?:\s*(?:of\s*)?(20\d{2}))?\b/);
    if (match) {
      const q = parseInt(match[1], 10) - 1;
      const qYear = match[2] ? parseInt(match[2], 10) : (q > Math.floor(month / 3) ? year - 1 : year);
      return {
        startDate: this.toIso(new Date(Date.UTC(qYear, q * 3, 1))),
        endDate: this.toIso(new Date(Date.UTC(qYear, q * 3 + 3, 0)))
      };
    }

    // "since March", "since March 5", "since 2025"
    match = text.match(new RegExp(`\\bsince\\s+${this.MONTH_PATTERN}(?:\\s+(\\d{1,2}))?(?:,?\\s+(20\\d{2}))?\\b`));
    if (match) {
      const mi = this.monthIndex(match[1]);
      const day = match[2] ? parseInt(match[2], 10) : 1;
      let y = match[3] ? parseInt(match[3], 10) : year;
      if (!match[3] && (mi > month || (mi === month && day > t.getUTCDate()))) y = year - 1;
      return { startDate: this.toIso(new Date(Date.UTC(y, mi, day))), endDate: null };
    }
    match = text.match(/\bsince\s+(20\d{2})\b/);
    if (match) return { startDate: `${match[1]}-01-01`, endDate: null };

    // "September", "in Sept 2026", "September 2025"
    match = text.match(new RegExp(`\\b${this.MONTH_PATTERN}(?:\\s+(20\\d{2}))?\\b`));
    // "may" is usually the verb; only treat it as a month after a preposition.
    const monthIsVerb = match && match[1] === 'may' && !/\b(in|during|for|of)\s+may\b/.test(text);
    if (match && !monthIsVerb) {
      const mi = this.monthIndex(match[1]);
      let y = match[2] ? parseInt(match[2], 10) : year;
      if (!match[2] && mi > month) y = year - 1;
      return this.monthRange(y, mi);
    }

    match = text.match(/\b(?:in|during|for)\s+(20\d{2})\b/);
    if (match) return { startDate: `${match[1]}-01-01`, endDate: `${match[1]}-12-31` };

    return null;
  }

  static parseDaysOfWeek(message) {
    const text = String(message || '').toLowerCase();
    const days = [];
    this.DAYS.forEach((name, index) => {
      if (new RegExp(`\\b(on\\s+)?${name}s?\\b`).test(text)) days.push(index);
    });
    return days;
  }

  /**
   * Match known labels (strategies, setups, tags) as whole words/phrases,
   * longest first so "swing trading" beats "swing".
   */
  static matchKnownTerms(message, terms = []) {
    const text = ` ${String(message || '').toLowerCase()} `;
    const found = [];
    const sorted = [...new Set(terms.filter(Boolean).map(String))].sort((a, b) => b.length - a.length);
    for (const term of sorted) {
      const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[_-]/g, '[\\s_-]');
      if (new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text)) found.push(term);
    }
    return found;
  }

  /**
   * Deterministic extraction. Returns null when nothing in the message looks
   * like a request about a set of trades.
   */
  static parseDeterministic(message, { today, known = {} } = {}) {
    const text = String(message || '');
    const lower = text.toLowerCase();
    const filters = {};
    const parts = [];

    const range = this.parseDateRange(text, today);
    if (range) {
      if (range.startDate) filters.startDate = range.startDate;
      if (range.endDate) filters.endDate = range.endDate;
      parts.push(this.formatRangeLabel(range.startDate, range.endDate));
    }

    if (/\b(los(?:ing|ses|ers|t)|red trades|unprofitable)\b/.test(lower)) { filters.pnlType = 'loss'; parts.push('losers'); }
    else if (/\b(winn(?:ing|ers)|wins|profitable|green trades)\b/.test(lower)) { filters.pnlType = 'profit'; parts.push('winners'); }
    else if (/\bbreak-?even\b/.test(lower)) { filters.pnlType = 'breakeven'; parts.push('breakeven'); }

    if (/\b(shorts|short (?:trades|positions|side|setups|entries)|went short|shorted)\b/.test(lower)) { filters.side = 'short'; parts.push('short side'); }
    else if (/\b(longs|long (?:trades|positions|side|setups|entries)|went long)\b/.test(lower)) { filters.side = 'long'; parts.push('long side'); }

    for (const [pattern, type] of this.INSTRUMENT_WORDS) {
      if (pattern.test(text)) { filters.instrumentTypes = [type]; parts.push(`${type}s`); break; }
    }

    if (/\bopen (?:positions|trades)\b/.test(lower)) { filters.status = 'open'; parts.push('open positions'); }
    else if (/\bclosed (?:positions|trades)\b/.test(lower)) { filters.status = 'closed'; }

    const gradeMatches = [...lower.matchAll(/\b(?:grade[sd]?\s+([a-f])|([a-f])[\s-]grade[sd]?)\b/g)]
      .map(m => (m[1] || m[2]).toUpperCase());
    if (gradeMatches.length) { filters.qualityGrades = [...new Set(gradeMatches)]; parts.push(`grade ${filters.qualityGrades.join('/')}`); }

    const days = this.parseDaysOfWeek(text);
    if (days.length) { filters.daysOfWeek = days; parts.push(days.map(d => this.DAYS[d].replace(/^./, c => c.toUpperCase()) + 's').join('/')); }

    const strategies = this.matchKnownTerms(text, known.strategies);
    if (strategies.length) { filters.strategies = strategies; parts.push(`strategy: ${strategies.join(', ')}`); }
    const setups = this.matchKnownTerms(text, known.setups);
    if (setups.length) { filters.setups = setups; parts.push(`setup: ${setups.join(', ')}`); }
    const tagged = [...text.matchAll(/(?:^|\s)#([a-z0-9_-]+)/gi)].map(m => m[1]);
    const tags = [...new Set([...this.matchKnownTerms(text, known.tags), ...this.matchKnownTerms(tagged.join(' '), known.tags)])];
    if (tags.length) { filters.tags = tags; parts.push(`tags: ${tags.join(', ')}`); }

    const knownSymbols = known.symbols instanceof Set ? known.symbols : new Set(known.symbols || []);
    const symbols = AIChatContext.extractSymbols(text, knownSymbols).filter(s => knownSymbols.has(s) || /\$/.test(text));
    if (symbols.length) { filters.symbol = symbols[0]; filters.symbolExact = true; parts.push(symbols[0]); }

    // Intent gate: a symbol alone is handled by the symbol-focus section.
    const hasQueryIntent = Boolean(range) || Boolean(filters.pnlType) || Boolean(filters.side) || Boolean(filters.instrumentTypes)
      || Boolean(filters.status) || Boolean(filters.qualityGrades) || days.length > 0 || strategies.length > 0 || setups.length > 0 || tags.length > 0;
    if (!hasQueryIntent) return null;

    return { filters, description: parts.filter(Boolean).join(' · ') };
  }

  // ---------------------------------------------------------------------
  // Model-assisted extraction (only when the cheap classifier model exists)
  // ---------------------------------------------------------------------

  static buildExtractionPrompt(message, { today, known }) {
    const clipped = String(message || '').slice(0, this.EXTRACTION_MAX_CHARS);
    const list = values => (values && values.length ? values.slice(0, this.MAX_KNOWN_TERMS).join(', ') : 'none');
    return `You extract trade filters from a trader's chat message for a trading journal. Today is ${today}.

Return ONLY compact JSON with these keys (omit keys that do not apply, use null for unknown):
{"is_trade_query":true|false,"start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","symbols":["AAPL"],"strategies":[],"setups":[],"tags":[],"side":"long"|"short","outcome":"win"|"loss"|"breakeven","instrument_types":["stock"|"option"|"future"|"forex"|"crypto"],"quality_grades":["A"],"status":"open"|"closed","days_of_week":[0-6 with 0=Sunday]}

Rules:
- is_trade_query is true only when the message asks about a specific set of the trader's own trades (a period, outcome, strategy, tag, symbol, side, instrument, or grade). General questions, market outlook questions, and greetings are false.
- Only use strategies, setups and tags from the trader's vocabulary below, spelled exactly as listed.
- Resolve relative dates against today. Use full month ranges for month names.

Trader's vocabulary:
- symbols traded: ${list([...(known.symbols || [])])}
- strategies: ${list(known.strategies)}
- setups: ${list(known.setups)}
- tags: ${list(known.tags)}

Message:
${clipped}`;
  }

  static parseExtraction(raw, { known }) {
    if (!raw || typeof raw !== 'string') return null;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    let parsed;
    try { parsed = JSON.parse(match[0]); } catch (error) { return null; }
    if (!parsed || parsed.is_trade_query !== true) return null;

    const iso = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
    const fromKnown = (values, vocabulary) => {
      if (!Array.isArray(values) || !vocabulary?.length) return [];
      const byLower = new Map(vocabulary.map(term => [String(term).toLowerCase(), term]));
      return [...new Set(values.map(v => byLower.get(String(v).toLowerCase())).filter(Boolean))];
    };
    const filters = {};
    const parts = [];
    const startDate = iso(parsed.start_date);
    const endDate = iso(parsed.end_date);
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (startDate || endDate) parts.push(this.formatRangeLabel(startDate, endDate));

    const knownSymbols = known.symbols instanceof Set ? known.symbols : new Set(known.symbols || []);
    const symbols = (Array.isArray(parsed.symbols) ? parsed.symbols : [])
      .map(s => String(s).toUpperCase())
      .filter(s => /^[A-Z]{1,6}(\.[A-Z]{1,2})?$/.test(s) && knownSymbols.has(s));
    if (symbols.length) { filters.symbol = symbols[0]; filters.symbolExact = true; parts.push(symbols[0]); }

    const strategies = fromKnown(parsed.strategies, known.strategies);
    if (strategies.length) { filters.strategies = strategies; parts.push(`strategy: ${strategies.join(', ')}`); }
    const setups = fromKnown(parsed.setups, known.setups);
    if (setups.length) { filters.setups = setups; parts.push(`setup: ${setups.join(', ')}`); }
    const tags = fromKnown(parsed.tags, known.tags);
    if (tags.length) { filters.tags = tags; parts.push(`tags: ${tags.join(', ')}`); }

    if (parsed.side === 'long' || parsed.side === 'short') { filters.side = parsed.side; parts.push(`${parsed.side} side`); }
    if (parsed.outcome === 'win') { filters.pnlType = 'profit'; parts.push('winners'); }
    else if (parsed.outcome === 'loss') { filters.pnlType = 'loss'; parts.push('losers'); }
    else if (parsed.outcome === 'breakeven') { filters.pnlType = 'breakeven'; parts.push('breakeven'); }

    const instruments = (Array.isArray(parsed.instrument_types) ? parsed.instrument_types : [])
      .filter(v => ['stock', 'option', 'future', 'forex', 'crypto'].includes(v));
    if (instruments.length) { filters.instrumentTypes = instruments; parts.push(instruments.map(i => `${i}s`).join('/')); }

    const grades = (Array.isArray(parsed.quality_grades) ? parsed.quality_grades : [])
      .map(g => String(g).toUpperCase()).filter(g => /^[A-F]$/.test(g));
    if (grades.length) { filters.qualityGrades = [...new Set(grades)]; parts.push(`grade ${filters.qualityGrades.join('/')}`); }

    if (parsed.status === 'open' || parsed.status === 'closed') { filters.status = parsed.status; if (parsed.status === 'open') parts.push('open positions'); }

    const days = (Array.isArray(parsed.days_of_week) ? parsed.days_of_week : [])
      .map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
    if (days.length) { filters.daysOfWeek = [...new Set(days)]; parts.push(days.map(d => `${this.DAYS[d].replace(/^./, c => c.toUpperCase())}s`).join('/')); }

    if (Object.keys(filters).length === 0) return null;
    return { filters, description: parts.filter(Boolean).join(' · ') };
  }

  static async extractWithModel(message, aiSettings, context) {
    if (aiSettings?.classifier?.enabled !== true) return null;
    try {
      const AISessionService = require('./aiSessionService');
      const settings = AISessionService.buildClassifierSettings(aiSettings);
      const raw = await AIProvider.generateResponse(this.buildExtractionPrompt(message, context), settings, {
        maxTokens: 220,
        temperature: 0
      });
      return this.parseExtraction(raw, context);
    } catch (error) {
      console.warn('[AI_TRADE_QUERY] Model extraction failed:', error.message);
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // Vocabulary + query
  // ---------------------------------------------------------------------

  static async getKnownTerms(userId) {
    const [symbols, strategies, setups, tags, tz] = await Promise.all([
      AIChatContext.getKnownSymbols(userId).catch(() => new Set()),
      db.query(`SELECT strategy AS term, COUNT(*)::int AS n FROM trades WHERE user_id = $1 AND strategy IS NOT NULL AND strategy <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT $2`, [userId, this.MAX_KNOWN_TERMS]).then(r => r.rows.map(x => x.term)).catch(() => []),
      db.query(`SELECT setup AS term, COUNT(*)::int AS n FROM trades WHERE user_id = $1 AND setup IS NOT NULL AND setup <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT $2`, [userId, this.MAX_KNOWN_TERMS]).then(r => r.rows.map(x => x.term)).catch(() => []),
      db.query(`SELECT tag AS term, COUNT(*)::int AS n FROM trades, unnest(tags) AS tag WHERE user_id = $1 AND tag <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT $2`, [userId, this.MAX_KNOWN_TERMS]).then(r => r.rows.map(x => x.term)).catch(() => []),
      db.query(`SELECT timezone FROM users WHERE id = $1`, [userId]).then(r => r.rows[0]?.timezone || 'UTC').catch(() => 'UTC')
    ]);
    return { symbols, strategies, setups, tags, timezone: tz };
  }

  /**
   * Resolve the filter for a message. Model fields override parser fields
   * where both exist; the parser fills anything the model left out.
   */
  static async resolveFilters(message, aiSettings, known) {
    const today = this.todayIn(known.timezone);
    const context = { today, known };
    const deterministic = this.parseDeterministic(message, context);
    const model = await this.extractWithModel(message, aiSettings, context);
    if (!deterministic && !model) return null;
    if (!model) return { ...deterministic, source: 'parser' };
    if (!deterministic) return { ...model, source: 'model' };
    return {
      filters: { ...deterministic.filters, ...model.filters },
      description: model.description || deterministic.description,
      source: 'merged'
    };
  }

  static describeTrade(trade, currency) {
    const money = value => currency.format(value);
    const qty = value => (value === null || value === undefined ? 'N/A' : String(Number(value)));
    const date = (trade.exit_time || trade.entry_time) ? new Date(trade.exit_time || trade.entry_time).toISOString().split('T')[0] : 'N/A';
    const status = trade.exit_price === null || trade.exit_price === undefined ? 'OPEN' : null;
    const extras = [
      trade.r_value !== null && trade.r_value !== undefined ? `${Number(trade.r_value).toFixed(2)}R` : null,
      trade.strategy || null,
      trade.setup ? `setup: ${trade.setup}` : null,
      Array.isArray(trade.tags) && trade.tags.length ? `tags: ${trade.tags.join(', ')}` : null,
      trade.quality_grade ? `grade ${trade.quality_grade}` : null,
      trade.notes ? `notes: ${AIChatContext.stripHtml(trade.notes, 160)}` : null
    ].filter(Boolean).join(', ');
    const exit = status ? 'open' : money(trade.exit_price);
    const pnl = status ? '' : `, P&L ${money(trade.pnl)}`;
    return `- ${date} ${trade.symbol} ${trade.side} ${qty(trade.quantity)} @ ${money(trade.entry_price)} -> ${exit}${pnl}${extras ? ` (${extras})` : ''}`;
  }

  /**
   * Run the resolved filter and render the prompt section.
   * @returns {Promise<{text: string, description: string, trade_count: number, filters: Object}|null>}
   */
  static async buildSection(userId, resolved, currency) {
    if (!resolved) return null;
    const filters = { ...resolved.filters };
    const [analytics, rows] = await Promise.all([
      TradeQueries.getAnalytics(userId, filters).catch(error => {
        console.warn('[AI_TRADE_QUERY] Analytics failed:', error.message);
        return null;
      }),
      TradeQueries.findByUser(userId, { ...filters, limit: this.MAX_TRADES_IN_PROMPT })
    ]);

    try { await currency.ensureRowRates(rows); } catch (error) { /* rows stay in their own currency */ }
    const trades = rows.map(row => currency.convertTradeRow(row).value);
    // Analytics aggregate closed trades only; an open-positions question is
    // answered by the list itself.
    const openOnly = filters.status === 'open';
    const summary = openOnly ? null : (analytics?.summary || null);
    const total = openOnly ? trades.length : (summary?.totalTrades ?? trades.length);

    const lines = [`TRADES MATCHING THE QUESTION (interpreted as: ${resolved.description || 'all trades'}; ${total} ${total === 1 ? 'trade' : 'trades'}):`];
    if (summary && total > 0) {
      const pf = Number(summary.profitFactor ?? 0);
      const profitFactor = pf >= 999 ? 'N/A (no losses)' : pf.toFixed(2);
      lines.push(`- Totals: P&L ${currency.format(currency.fromUsd(summary.totalPnL))}, win rate ${Number(summary.winRate ?? 0).toFixed(1)}%, profit factor ${profitFactor}, avg win ${currency.format(currency.fromUsd(summary.avgWin))}, avg loss ${currency.format(currency.fromUsd(summary.avgLoss))}, best ${currency.format(currency.fromUsd(summary.bestTrade))}, worst ${currency.format(currency.fromUsd(summary.worstTrade))}`);
    }
    if (trades.length) {
      lines.push(trades.length < total ? `- Most recent ${trades.length} of ${total}:` : '- Trades:');
      trades.forEach(trade => lines.push(this.describeTrade(trade, currency)));
    } else {
      lines.push('- No trades match this interpretation.');
    }
    lines.push('- If this interpretation does not match what the trader asked, say how you read it and ask them to clarify rather than guessing.');

    return {
      text: lines.join('\n'),
      description: resolved.description || '',
      trade_count: total,
      filters,
      source: resolved.source
    };
  }

  /**
   * One-call entry point used by the chat: vocabulary, extraction, query.
   * Never throws.
   */
  static async build(userId, message, aiSettings, currency) {
    try {
      const known = await this.getKnownTerms(userId);
      const resolved = await this.resolveFilters(message, aiSettings, known);
      if (!resolved) return null;
      return await this.buildSection(userId, resolved, currency);
    } catch (error) {
      console.warn('[AI_TRADE_QUERY] Could not build trade query section:', error.message);
      return null;
    }
  }
}

module.exports = AIChatTradeQuery;
