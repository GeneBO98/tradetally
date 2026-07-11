/**
 * Trade Replay data service
 *
 * Builds the full payload a replay session needs in one request: 1-minute
 * OHLCV bars for the trade's session window plus the trade's fills normalized
 * to signed buy/sell events. Bars are stepped client-side; nothing streams.
 *
 * Provider selection follows the instance's MARKET_DATA_PROVIDER (FMP or
 * Finnhub) via utils/finnhub. Closed-session bars are immutable market data,
 * so they are cached globally in Postgres (intraday_candles) and each
 * symbol/session is fetched from the upstream provider at most once.
 *
 * All timestamps in the payload are epoch seconds UTC. The payload carries
 * the exchange timezone and its UTC offset so the frontend can shift bar
 * times uniformly for display without depending on the browser timezone.
 */

const db = require('../config/database');
const marketData = require('../utils/finnhub');
const alphaVantage = require('../utils/alphaVantage');
const databento = require('../utils/databento');
const { resolvePriceScale, applyPriceScale } = require('../utils/candlePriceScale');
const {
  getFuturesPointValue,
  getFuturesTickSize,
  extractUnderlyingFromFuturesSymbol
} = require('../utils/futuresUtils');
const { multiplierFor, isBuyAction, isSellAction, normalizeAction } = require('./pnlEngine');

const NY_TZ = 'America/New_York';
const INTERVAL = '1min';
// Extended-hours session window in exchange time (04:00 - 20:00 ET)
const SESSION_START_HOUR = 4;
const SESSION_END_HOUR = 20;
// CME Globex trading day for date D: 18:00 ET on D-1 through 17:00 ET on D
// (daily maintenance break 17:00-18:00). Closed Sat 18:00 ET - Sun 18:00 ET,
// so a Globex window never straddles the 2am-Sunday DST transition.
const FUTURES_SESSION_START_HOUR = 18; // on the previous calendar day
const FUTURES_SESSION_END_HOUR = 17;
// Don't persist bars for a session until this long after it ends, so a
// partially-complete day is never recorded as covered.
const SESSION_CLOSE_BUFFER_SECONDS = 30 * 60;

function wallClockPartsInZone(epochMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(new Date(epochMs));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  // Intl formats midnight as hour 24 in some environments
  const hour = get('hour') % 24;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second')
  };
}

function tzOffsetMs(epochMs, timeZone) {
  const p = wallClockPartsInZone(epochMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - epochMs;
}

// Epoch seconds for a wall-clock time in a specific timezone. Single-pass
// offset lookup is sufficient here: US DST transitions happen at 2am Sunday
// when equity markets are closed, so session windows never straddle one.
function zonedEpochSeconds(year, month, day, hour, minute, second, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  return Math.floor((guess - tzOffsetMs(guess, timeZone)) / 1000);
}

function toEpochSeconds(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number') return Math.floor(value > 1e12 ? value / 1000 : value);
  const str = String(value).trim();
  if (!str) return null;
  // Executions were normalized to UTC (migration 134) but many stored strings
  // carry no offset suffix; Node would parse those as server-local, so pin
  // offsetless strings to UTC explicitly.
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(str);
  const isoish = str.replace(' ', 'T');
  const ms = Date.parse(hasOffset ? isoish : `${isoish}Z`);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

function parseExecutions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a trade's executions to chronological signed fills:
 *   { time (epoch s UTC), price, quantity (positive), action ('buy'|'sell') }
 *
 * Handles the two stored execution shapes (raw broker fills with
 * action/datetime, and grouped round-trip records carrying entry/exit pairs)
 * and falls back to synthesizing entry/exit fills from the trade record.
 */
function normalizeFills(trade) {
  const executions = parseExecutions(trade.executions);
  const side = trade.side === 'short' ? 'short' : 'long';
  const fills = [];

  const grouped = executions.length > 0 && executions.every((e) =>
    e && (e.entry_price !== undefined || e.entryPrice !== undefined)
  );

  if (grouped) {
    for (const exec of executions) {
      const quantity = Math.abs(asNumber(exec.quantity) ?? 0);
      if (!quantity) continue;
      const entryTime = toEpochSeconds(exec.entry_time ?? exec.entryTime);
      const entryPrice = asNumber(exec.entry_price ?? exec.entryPrice);
      if (entryTime && entryPrice !== null) {
        fills.push({ time: entryTime, price: entryPrice, quantity, action: side === 'short' ? 'sell' : 'buy' });
      }
      const exitTime = toEpochSeconds(exec.exit_time ?? exec.exitTime);
      const exitPrice = asNumber(exec.exit_price ?? exec.exitPrice);
      if (exitTime && exitPrice !== null) {
        fills.push({ time: exitTime, price: exitPrice, quantity, action: side === 'short' ? 'buy' : 'sell' });
      }
    }
  } else {
    for (const exec of executions) {
      const quantity = Math.abs(asNumber(exec.quantity) ?? 0);
      const price = asNumber(exec.price);
      const time = toEpochSeconds(exec.datetime ?? exec.time);
      if (!quantity || price === null || !time) continue;
      const action = normalizeAction(exec.action || exec.side || '');
      if (isBuyAction(action)) {
        fills.push({ time, price, quantity, action: 'buy' });
      } else if (isSellAction(action)) {
        fills.push({ time, price, quantity, action: 'sell' });
      }
    }
  }

  if (fills.length === 0) {
    const quantity = Math.abs(asNumber(trade.quantity) ?? 0);
    const entryTime = toEpochSeconds(trade.entry_time || trade.trade_date);
    const entryPrice = asNumber(trade.entry_price);
    if (quantity && entryTime && entryPrice !== null) {
      fills.push({ time: entryTime, price: entryPrice, quantity, action: side === 'short' ? 'sell' : 'buy' });
    }
    const exitTime = toEpochSeconds(trade.exit_time);
    const exitPrice = asNumber(trade.exit_price);
    if (quantity && exitTime && exitPrice !== null) {
      fills.push({ time: exitTime, price: exitPrice, quantity, action: side === 'short' ? 'buy' : 'sell' });
    }
  }

  fills.sort((a, b) => a.time - b.time);
  return fills;
}

/**
 * Compute the extended-hours session window (04:00-20:00 ET) for a calendar
 * day, in true UTC epoch seconds.
 */
function sessionWindowForDate(year, month, day) {
  const fromTs = zonedEpochSeconds(year, month, day, SESSION_START_HOUR, 0, 0, NY_TZ);
  const toTs = zonedEpochSeconds(year, month, day, SESSION_END_HOUR, 0, 0, NY_TZ);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    fromTs,
    toTs
  };
}

/**
 * Compute the extended-hours session window (04:00-20:00 ET) containing the
 * trade's entry, in true UTC epoch seconds.
 */
function sessionWindowForEntry(entryEpochSeconds) {
  const p = wallClockPartsInZone(entryEpochSeconds * 1000, NY_TZ);
  return sessionWindowForDate(p.year, p.month, p.day);
}

/**
 * Compute the CME Globex trading-day window for a calendar trading date:
 * 18:00 ET on the previous calendar day through 17:00 ET on the date itself,
 * in true UTC epoch seconds. `date` stays the trading date.
 */
function futuresSessionWindowForDate(year, month, day) {
  const prev = new Date(Date.UTC(year, month - 1, day) - 24 * 60 * 60 * 1000);
  const fromTs = zonedEpochSeconds(
    prev.getUTCFullYear(),
    prev.getUTCMonth() + 1,
    prev.getUTCDate(),
    FUTURES_SESSION_START_HOUR, 0, 0, NY_TZ
  );
  const toTs = zonedEpochSeconds(year, month, day, FUTURES_SESSION_END_HOUR, 0, 0, NY_TZ);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    fromTs,
    toTs
  };
}

/**
 * Globex trading-day window containing the trade's entry. Entries at or after
 * 18:00 ET belong to the NEXT calendar day's trading date. An entry inside the
 * 17:00-18:00 maintenance break maps to the session that just ended (its fill
 * marker sits at the session's last bar), which keeps the mapping simple.
 */
function futuresSessionWindowForEntry(entryEpochSeconds) {
  const p = wallClockPartsInZone(entryEpochSeconds * 1000, NY_TZ);
  if (p.hour >= FUTURES_SESSION_START_HOUR) {
    const next = new Date(Date.UTC(p.year, p.month - 1, p.day) + 24 * 60 * 60 * 1000);
    return futuresSessionWindowForDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }
  return futuresSessionWindowForDate(p.year, p.month, p.day);
}

async function getCoverage(symbol, sessionDate) {
  const result = await db.query(
    `SELECT from_ts, to_ts, source, candle_count
     FROM intraday_candle_coverage
     WHERE symbol = $1 AND interval = $2 AND session_date = $3`,
    [symbol, INTERVAL, sessionDate]
  );
  return result.rows[0] || null;
}

async function getCachedBars(symbol, fromTs, toTs) {
  const result = await db.query(
    `SELECT ts, open, high, low, close, volume
     FROM intraday_candles
     WHERE symbol = $1 AND interval = $2 AND ts >= $3 AND ts <= $4
     ORDER BY ts ASC`,
    [symbol, INTERVAL, fromTs, toTs]
  );
  return result.rows.map((row) => ({
    time: Number(row.ts),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: row.volume === null ? null : Number(row.volume)
  }));
}

async function storeBars(symbol, sessionDate, fromTs, toTs, bars, source) {
  if (bars.length === 0) return;
  const values = [];
  const params = [];
  let i = 1;
  for (const bar of bars) {
    // FMP occasionally reports fractional volumes; the column is BIGINT
    const volume = bar.volume === null || bar.volume === undefined
      ? null
      : Math.round(Number(bar.volume));
    values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
    params.push(symbol, INTERVAL, bar.time, bar.open, bar.high, bar.low, bar.close, volume, source);
  }
  await db.query(
    `INSERT INTO intraday_candles (symbol, interval, ts, open, high, low, close, volume, source)
     VALUES ${values.join(', ')}
     ON CONFLICT (symbol, interval, ts) DO NOTHING`,
    params
  );
  await db.query(
    `INSERT INTO intraday_candle_coverage (symbol, interval, session_date, from_ts, to_ts, source, candle_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (symbol, interval, session_date) DO UPDATE
       SET from_ts = EXCLUDED.from_ts,
           to_ts = EXCLUDED.to_ts,
           source = EXCLUDED.source,
           candle_count = EXCLUDED.candle_count,
           fetched_at = NOW()`,
    [symbol, INTERVAL, sessionDate, fromTs, toTs, source, bars.length]
  );
}

function dedupeSortBars(bars) {
  const byTime = new Map();
  for (const bar of bars) {
    if (bar && Number.isFinite(bar.time) && Number.isFinite(bar.close)) {
      byTime.set(bar.time, bar);
    }
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

/**
 * Fetch 1-min bars from the configured provider for the session window,
 * normalized to true UTC epochs. Throws if the provider has no intraday data
 * (paywalled key, delisted symbol, too-old session).
 */
async function fetchIntradayBars(symbol, fromTs, toTs, userId) {
  const rawBars = await marketData.getStockCandles(symbol, '1', fromTs, toTs, userId, { source: 'replay' });
  const bars = rawBars.map((bar) => ({ ...bar }));
  // Providers are queried by date, so responses can spill past the session
  // window; keep only bars inside it.
  return dedupeSortBars(bars).filter((bar) => bar.time >= fromTs && bar.time <= toTs);
}

/**
 * Daily-candle fallback when intraday data is unavailable. Returns bars in
 * the same shape with `time` at daily granularity.
 */
async function fetchDailyBars(symbol, entryEpochSeconds, exitEpochSeconds, userId) {
  const daySeconds = 24 * 60 * 60;
  const fromTs = entryEpochSeconds - 30 * daySeconds;
  const toTs = (exitEpochSeconds || entryEpochSeconds) + 10 * daySeconds;
  try {
    const bars = await marketData.getStockCandles(symbol, 'D', fromTs, toTs, userId, { source: 'replay' });
    return { bars: dedupeSortBars(bars), source: marketData.providerName };
  } catch (providerError) {
    if (!alphaVantage.isConfigured()) throw providerError;
    const entryIso = new Date(entryEpochSeconds * 1000).toISOString();
    const exitIso = exitEpochSeconds ? new Date(exitEpochSeconds * 1000).toISOString() : null;
    const chartData = await alphaVantage.getTradeChartData(symbol, entryIso, exitIso);
    return { bars: dedupeSortBars(chartData.candles || []), source: 'alphavantage' };
  }
}

function isQuotaError(error) {
  return error && (error.code === 'PRO_REQUIRED' || error.code === 'RATE_LIMIT_EXCEEDED');
}

/**
 * Cache-first 1-min bar loading for a session window: global cache, then
 * `fetchFn` (persisting the result once the session is closed). Throws the
 * provider error when intraday data is unavailable; callers decide whether to
 * degrade (trade replay) or fail (backtest).
 */
async function loadBarsWithCache(cacheSymbol, session, fetchFn, sourceName) {
  const coverage = await getCoverage(cacheSymbol, session.date);
  if (coverage) {
    const cached = await getCachedBars(cacheSymbol, session.fromTs, session.toTs);
    if (cached.length > 0) {
      return { candles: cached, source: `cache:${coverage.source || 'unknown'}` };
    }
  }

  const candles = await fetchFn();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionClosed = session.toTs + SESSION_CLOSE_BUFFER_SECONDS < nowSeconds;
  if (sessionClosed && candles.length > 0) {
    try {
      await storeBars(cacheSymbol, session.date, session.fromTs, session.toTs, candles, sourceName);
    } catch (cacheError) {
      console.warn(`[REPLAY] Failed to cache bars for ${cacheSymbol} ${session.date}: ${cacheError.message}`);
    }
  }
  return { candles, source: sourceName };
}

/**
 * Load 1-min bars for an equity session from the configured stock provider.
 */
function loadSessionBars(symbol, session, userId) {
  return loadBarsWithCache(
    symbol,
    session,
    () => fetchIntradayBars(symbol, session.fromTs, session.toTs, userId),
    marketData.providerName
  );
}

/**
 * Load 1-min bars for a futures Globex session from Databento. Bars are the
 * continuous front-month contract, cached under its Databento symbol
 * (e.g. "MNQ.c.0") so each root/session is billed at most once.
 */
function loadFuturesSessionBars(root, session) {
  const cacheSymbol = databento.getContinuousSymbol(root);
  return loadBarsWithCache(
    cacheSymbol,
    session,
    async () => {
      const bars = await databento.getFuturesCandles(
        root,
        new Date(session.fromTs * 1000),
        new Date(session.toTs * 1000),
        'minute',
        { exactWindow: true }
      );
      return dedupeSortBars(bars).filter((bar) => bar.time >= session.fromTs && bar.time <= session.toTs);
    },
    'databento'
  );
}

/**
 * Build the complete replay payload for one trade.
 *
 * @param {object} trade - trade row (snake_case fields, from Trade.findById)
 * @param {string} userId
 * @returns {object} replay payload (all times epoch seconds UTC)
 */
async function getTradeReplayData(trade, userId) {
  const instrumentType = trade.instrument_type || 'stock';
  const isFutures = instrumentType === 'future';

  const entryTs = toEpochSeconds(trade.entry_time || trade.trade_date);
  if (!entryTs) {
    const error = new Error('Trade is missing entry time information');
    error.statusCode = 400;
    throw error;
  }
  const exitTs = toEpochSeconds(trade.exit_time);

  // For options, trade.symbol holds the underlying; the chart shows the
  // underlying's price action with option fills overlaid as markers.
  let chartSymbol = String(trade.symbol || '').toUpperCase();
  if (!chartSymbol) {
    const error = new Error('Trade is missing symbol information');
    error.statusCode = 400;
    throw error;
  }

  // Futures chart the continuous front-month contract from Databento.
  let futuresRoot = null;
  if (isFutures) {
    if (!databento.isConfigured()) {
      const error = new Error('Futures replay requires a Databento API key. Self-hosted: set DATABENTO_API_KEY in the backend environment (databento.com signup includes free credits).');
      error.statusCode = 422;
      throw error;
    }
    futuresRoot = String(
      trade.underlying_asset || extractUnderlyingFromFuturesSymbol(trade.symbol) || ''
    ).toUpperCase();
    if (!futuresRoot) {
      const error = new Error(`Could not determine the futures contract root for ${trade.symbol}`);
      error.statusCode = 422;
      throw error;
    }
    chartSymbol = databento.getContinuousSymbol(futuresRoot);
  }

  const session = isFutures ? futuresSessionWindowForEntry(entryTs) : sessionWindowForEntry(entryTs);
  const fills = normalizeFills(trade);

  let candles = [];
  let resolution = INTERVAL;
  let source = null;
  let degraded = false;
  let degradedReason = null;

  if (isFutures) {
    try {
      const loaded = await loadFuturesSessionBars(futuresRoot, session);
      candles = loaded.candles;
      source = loaded.source;
    } catch (futuresError) {
      // Databento errors carry actionable detail (auth, credits, no data) -
      // no daily degradation for futures, playing a day needs intraday bars.
      const error = new Error(`No futures chart data available for ${futuresRoot} on ${session.date}: ${futuresError.message}`);
      error.statusCode = 404;
      throw error;
    }
  } else {
    try {
      const loaded = await loadSessionBars(chartSymbol, session, userId);
      candles = loaded.candles;
      source = loaded.source;
    } catch (intradayError) {
      if (isQuotaError(intradayError)) throw intradayError;
      console.warn(`[REPLAY] Intraday data unavailable for ${chartSymbol} ${session.date} (${intradayError.message}), degrading to daily`);
      try {
        const daily = await fetchDailyBars(chartSymbol, entryTs, exitTs, userId);
        candles = daily.bars;
        resolution = 'daily';
        source = daily.source;
        degraded = true;
        degradedReason = intradayError.message;
      } catch (dailyError) {
        if (isQuotaError(dailyError)) throw dailyError;
        const error = new Error(`No chart data available for ${chartSymbol}. The symbol may be delisted, inactive, or not supported by the market data provider.`);
        error.statusCode = 404;
        throw error;
      }
    }
  }

  if (candles.length === 0) {
    const error = new Error(`No chart data available for ${chartSymbol}`);
    error.statusCode = 404;
    throw error;
  }

  // Rescale split-adjusted provider bars into the fills' raw price space.
  // Done at serve time (never at cache time) so the cache stays a verbatim
  // provider mirror and later splits self-correct against the fills.
  // Futures are exempt: this is stock-split logic, and continuous-contract
  // basis differences must never trigger an integer rescale.
  const priceScale = isFutures ? 1 : resolvePriceScale(candles, fills);
  candles = applyPriceScale(candles, priceScale);

  // multiplierFor falls back to 1 when a futures trade has no point_value;
  // recover the contract's real point value from its root instead.
  let multiplier = multiplierFor(instrumentType, trade.contract_size, trade.point_value);
  if (isFutures && !asNumber(trade.point_value)) {
    multiplier = getFuturesPointValue(futuresRoot);
  }

  return {
    symbol: trade.symbol,
    chart_symbol: chartSymbol,
    resolution,
    source,
    degraded,
    degraded_reason: degradedReason,
    price_scale: priceScale,
    futures_continuous: isFutures,
    session: {
      date: session.date,
      from_ts: session.fromTs,
      to_ts: session.toTs,
      timezone: NY_TZ,
      // Add this to every timestamp before feeding the chart so axis labels
      // read as exchange-local wall clock regardless of browser timezone.
      display_offset_seconds: Math.floor(tzOffsetMs(session.fromTs * 1000, NY_TZ) / 1000)
    },
    candles,
    fills,
    trade: {
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      entry_price: asNumber(trade.entry_price),
      exit_price: asNumber(trade.exit_price),
      quantity: asNumber(trade.quantity),
      pnl: asNumber(trade.pnl),
      pnl_percent: asNumber(trade.pnl_percent),
      stop_loss: asNumber(trade.stop_loss),
      take_profit: asNumber(trade.take_profit),
      instrument_type: instrumentType,
      option_type: trade.option_type || null,
      strike_price: asNumber(trade.strike_price),
      multiplier,
      tick_size: isFutures ? (asNumber(trade.tick_size) ?? getFuturesTickSize(futuresRoot)) : null,
      entry_time_ts: entryTs,
      exit_time_ts: exitTs
    }
  };
}

/**
 * Build the candle payload for a backtest sandbox session: 1-min bars for an
 * arbitrary symbol + past session date. No fills exist yet (the user places
 * simulated orders during playback), so there is no split-rescaling — bars are
 * served in the provider's current adjusted price space. Intraday-only:
 * stepping a day bar-by-bar is meaningless on daily candles, so unavailable
 * intraday data is an error rather than a degradation.
 *
 * @param {string} symbol - already validated/uppercased ticker
 * @param {string} sessionDate - YYYY-MM-DD calendar date (exchange time)
 * @param {string} userId
 */
async function getBacktestSessionData(symbol, sessionDate, userId, options = {}) {
  const instrument = options.instrument === 'future' ? 'future' : 'stock';
  const isFutures = instrument === 'future';

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(sessionDate || ''));
  if (!match) {
    const error = new Error('Session date must be in YYYY-MM-DD format');
    error.statusCode = 400;
    throw error;
  }
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    const error = new Error('Invalid session date');
    error.statusCode = 400;
    throw error;
  }

  // Session dates are Mon-Fri for both instruments. Futures trade Sunday
  // evening, but on Globex those hours belong to Monday's trading date.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 6) {
    const error = new Error('Markets are closed on Saturdays. Pick a weekday session.');
    error.statusCode = 422;
    throw error;
  }
  if (weekday === 0) {
    const error = new Error(isFutures
      ? "Sunday evening trading belongs to Monday's session. Pick Monday's date."
      : 'Markets are closed on weekends. Pick a weekday session.');
    error.statusCode = 422;
    throw error;
  }

  if (isFutures && !databento.isConfigured()) {
    const error = new Error('Futures backtesting requires a Databento API key. Self-hosted: set DATABENTO_API_KEY in the backend environment (databento.com signup includes free credits).');
    error.statusCode = 422;
    throw error;
  }

  const session = isFutures
    ? futuresSessionWindowForDate(year, month, day)
    : sessionWindowForDate(year, month, day);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (session.toTs + SESSION_CLOSE_BUFFER_SECONDS > nowSeconds) {
    const error = new Error('Backtesting is available for completed sessions only. Pick a past trading day.');
    error.statusCode = 422;
    throw error;
  }

  let loaded;
  try {
    loaded = isFutures
      ? await loadFuturesSessionBars(symbol, session)
      : await loadSessionBars(symbol, session, userId);
  } catch (intradayError) {
    if (isQuotaError(intradayError) || intradayError.statusCode) throw intradayError;
    const error = new Error(isFutures
      ? `No futures data available for ${symbol} on ${session.date}: ${intradayError.message}`
      : `No intraday data available for ${symbol} on ${session.date}. The market may have been closed, or the symbol may not be supported by the market data provider.`);
    error.statusCode = 404;
    throw error;
  }

  if (loaded.candles.length === 0) {
    const error = new Error(`No intraday data available for ${symbol} on ${session.date}. The market may have been closed that day.`);
    error.statusCode = 404;
    throw error;
  }

  return {
    symbol,
    instrument_type: instrument,
    multiplier: isFutures ? getFuturesPointValue(symbol) : 1,
    tick_size: isFutures ? getFuturesTickSize(symbol) : null,
    resolution: INTERVAL,
    source: loaded.source,
    futures_continuous: isFutures,
    session: {
      date: session.date,
      from_ts: session.fromTs,
      to_ts: session.toTs,
      timezone: NY_TZ,
      display_offset_seconds: Math.floor(tzOffsetMs(session.fromTs * 1000, NY_TZ) / 1000)
    },
    candles: loaded.candles
  };
}

async function countReplayedTrades(userId) {
  const result = await db.query(
    'SELECT COUNT(*)::int AS count FROM replay_usage WHERE user_id = $1',
    [userId]
  );
  return result.rows[0].count;
}

async function hasReplayedTrade(userId, tradeId) {
  const result = await db.query(
    'SELECT 1 FROM replay_usage WHERE user_id = $1 AND trade_id = $2',
    [userId, tradeId]
  );
  return result.rows.length > 0;
}

async function recordReplayUsage(userId, tradeId) {
  await db.query(
    `INSERT INTO replay_usage (user_id, trade_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, trade_id) DO NOTHING`,
    [userId, tradeId]
  );
}

module.exports = {
  getTradeReplayData,
  getBacktestSessionData,
  countReplayedTrades,
  hasReplayedTrade,
  recordReplayUsage,
  // Exported for tests
  normalizeFills,
  sessionWindowForEntry,
  sessionWindowForDate,
  futuresSessionWindowForEntry,
  futuresSessionWindowForDate,
  toEpochSeconds
};
