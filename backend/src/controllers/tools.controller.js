const db = require('../config/database');
const finnhub = require('../utils/finnhub');
const alphaVantage = require('../utils/alphaVantage');
const cache = require('../utils/cache');
const historicalPriceCache = require('../utils/historicalPriceCache');

const SYMBOL_SEARCH_CACHE_TTL = 300000; // 5 minutes

const SYMBOL_REGEX = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const MIN_DATE = '1995-01-01';
const MAX_AMOUNT = 10_000_000;
const MAX_MONTHLY = 100_000;

function parseSymbol(value) {
  if (!value || typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return SYMBOL_REGEX.test(upper) ? upper : null;
}

function parseAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) return null;
  return n;
}

function parseMonthly(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONTHLY) return null;
  return n;
}

function parseDate(value) {
  if (!value || typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  const minDate = new Date(`${MIN_DATE}T00:00:00Z`);
  const maxDate = new Date();
  maxDate.setUTCHours(0, 0, 0, 0);
  maxDate.setUTCDate(maxDate.getUTCDate() - 1);

  if (parsed < minDate || parsed > maxDate) return null;
  return value;
}

function dateToUnix(dateStr) {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

function shiftDate(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().split('T')[0];
}

function todayString() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/**
 * Add `n` calendar months to a date, clamping the day to the last day of
 * the target month if the original day doesn't exist (e.g. Jan 31 + 1 → Feb 28).
 */
function addMonths(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const targetDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const lastDayOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(targetDay, lastDayOfMonth));
  return d.toISOString().split('T')[0];
}

/**
 * Pick the candle that best matches the requested date. Falls forward (next
 * trading day) for weekend/holiday dates, then falls back to the prior
 * trading day if no forward match is in range.
 */
function pickCandleForDate(candles, targetDateStr, maxGapDays = 7) {
  if (!candles || candles.length === 0) return null;
  const targetUnix = dateToUnix(targetDateStr);

  const sorted = [...candles].sort((a, b) => a.time - b.time);

  const onOrAfter = sorted.find(c => c.time >= targetUnix);
  if (onOrAfter && onOrAfter.time - targetUnix <= maxGapDays * 86400) return onOrAfter;

  const before = [...sorted].reverse().find(c => c.time <= targetUnix);
  if (before && targetUnix - before.time <= maxGapDays * 86400) return before;

  return null;
}

/**
 * Return all daily candles for `symbol` covering `startDate` to today,
 * fetching from APIs only if the cache is incomplete. Used for monthly
 * contribution calculations that need the full price history.
 */
async function getFullDailyHistory(symbol, startDate) {
  const today = todayString();

  // Check DB cache first
  let candles = await historicalPriceCache.getRange(symbol, startDate, today);
  const hasGoodCoverage = candles && candles.length > 0 &&
    await historicalPriceCache.hasRange(symbol, startDate, today);

  if (hasGoodCoverage) return candles;

  // Cache miss / sparse — try Finnhub for the full window first.
  const fromUnix = dateToUnix(shiftDate(startDate, -7));
  const toUnix = dateToUnix(today) + 86400;

  let fetched = null;
  try {
    fetched = await finnhub.getStockCandles(symbol, 'D', fromUnix, toUnix);
  } catch (_) {
    fetched = null;
  }

  if (!fetched || fetched.length === 0) {
    // Fall back to Alpha Vantage's full series (20+ years, includes delisted).
    if (alphaVantage.isConfigured()) {
      try {
        const av = await alphaVantage.getDailyData(symbol, 'full');
        if (av && av.length > 0) {
          try {
            await historicalPriceCache.insertCandles(symbol, av, 'alphavantage');
          } catch (dbErr) {
            console.warn(`[TOOLS] Failed to persist AV candles for ${symbol}: ${dbErr.message}`);
          }
          fetched = av;
        }
      } catch (avErr) {
        console.warn(`[TOOLS] Alpha Vantage full history failed for ${symbol}: ${avErr.message}`);
      }
    }
  } else {
    // Persist Finnhub data
    try {
      await historicalPriceCache.insertCandles(symbol, fetched, 'finnhub');
    } catch (dbErr) {
      console.warn(`[TOOLS] Failed to persist candles for ${symbol}: ${dbErr.message}`);
    }
  }

  if (!fetched || fetched.length === 0) return null;

  // Combine cached + freshly fetched, dedupe by date
  const combined = [...(candles || []), ...fetched];
  const byTime = new Map();
  for (const c of combined) byTime.set(c.time, c);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

async function whatIfInvested(req, res) {
  const symbol = parseSymbol(req.query.symbol);
  const amount = parseAmount(req.query.amount);
  const date = parseDate(req.query.date);
  const monthly = parseMonthly(req.query.monthly);

  if (!symbol) {
    return res.status(400).json({ error: 'invalid_symbol', message: 'Symbol must be 1–10 uppercase letters/digits, optionally with . or -.' });
  }
  if (!amount) {
    return res.status(400).json({ error: 'invalid_amount', message: `Amount must be a positive number up to ${MAX_AMOUNT}.` });
  }
  if (monthly === null) {
    return res.status(400).json({ error: 'invalid_monthly', message: `Monthly contribution must be between 0 and ${MAX_MONTHLY}.` });
  }
  if (!date) {
    return res.status(400).json({ error: 'invalid_date', message: `Date must be YYYY-MM-DD between ${MIN_DATE} and yesterday.` });
  }

  try {
    let candles;

    if (monthly > 0) {
      // Need full history to price each monthly contribution
      candles = await getFullDailyHistory(symbol, date);
    } else {
      // One-time investment — narrow window is fine
      const cacheStart = shiftDate(date, -7);
      const cacheEnd = shiftDate(date, 7);
      candles = await historicalPriceCache.getRange(symbol, cacheStart, cacheEnd);

      if (!candles || candles.length === 0) {
        const fromUnix = dateToUnix(shiftDate(date, -15));
        const toUnix = dateToUnix(shiftDate(date, 15));
        let fetched = null;
        let primaryErr = null;
        try {
          fetched = await finnhub.getStockCandles(symbol, 'D', fromUnix, toUnix);
        } catch (err) {
          primaryErr = err;
        }
        if ((!fetched || fetched.length === 0) && alphaVantage.isConfigured()) {
          try {
            const avCandles = await alphaVantage.getDailyData(symbol, 'full');
            if (avCandles && avCandles.length > 0) {
              try {
                await historicalPriceCache.insertCandles(symbol, avCandles, 'alphavantage');
              } catch (dbErr) {
                console.warn(`[TOOLS] Failed to persist AV candles for ${symbol}: ${dbErr.message}`);
              }
              fetched = avCandles;
            }
          } catch (avErr) {
            console.warn(`[TOOLS] Alpha Vantage fallback failed for ${symbol}: ${avErr.message}`);
          }
        }
        if (fetched && fetched.length > 0) {
          if (!primaryErr) {
            try {
              await historicalPriceCache.insertCandles(symbol, fetched, 'finnhub');
            } catch (dbErr) {
              console.warn(`[TOOLS] Failed to persist candles for ${symbol}: ${dbErr.message}`);
            }
          }
          candles = fetched;
        }
      }
    }

    if (!candles || candles.length === 0) {
      return res.status(404).json({
        error: 'no_data',
        message: `No historical price data found for ${symbol} near ${date}. The ticker may have been delisted, not yet IPO'd, or unsupported by our data providers.`
      });
    }

    // Initial purchase
    const purchaseCandle = pickCandleForDate(candles, date);
    if (!purchaseCandle || !purchaseCandle.close || purchaseCandle.close <= 0) {
      return res.status(404).json({ error: 'no_data', message: `No trading day found near ${date} for ${symbol}.` });
    }

    const purchasePrice = purchaseCandle.close;
    const purchaseDateStr = new Date(purchaseCandle.time * 1000).toISOString().split('T')[0];

    // Walk monthly anniversaries and accumulate shares
    let totalShares = amount / purchasePrice;
    let totalInvested = amount;
    let contributionsMade = 0;
    let firstSkippedMonth = null;
    const today = todayString();
    let lastDataDate = purchaseDateStr;

    if (monthly > 0) {
      const lastCandle = candles[candles.length - 1];
      const lastCandleDate = new Date(lastCandle.time * 1000).toISOString().split('T')[0];
      lastDataDate = lastCandleDate;

      let nextDate = addMonths(date, 1);
      while (nextDate <= today) {
        // Only contribute if we have data for that month (otherwise the
        // ticker was already delisted by then).
        if (nextDate > lastCandleDate) {
          if (!firstSkippedMonth) firstSkippedMonth = nextDate;
          break;
        }
        const monthCandle = pickCandleForDate(candles, nextDate, 14);
        if (monthCandle && monthCandle.close > 0) {
          totalShares += monthly / monthCandle.close;
          totalInvested += monthly;
          contributionsMade += 1;
        }
        nextDate = addMonths(nextDate, 1);
      }
    }

    // Current price (live quote → fall back to last cached close for delisted)
    let currentPrice = null;
    let priceAsOf = today;
    let isDelisted = false;
    try {
      const quote = await finnhub.getQuote(symbol);
      if (quote?.c && quote.c > 0) {
        currentPrice = quote.c;
      }
    } catch (_) {
      // ignore
    }
    if (!currentPrice) {
      const latest = await db.query(
        `SELECT price_date, close FROM historical_prices
         WHERE symbol = $1 AND close IS NOT NULL
         ORDER BY price_date DESC
         LIMIT 1`,
        [symbol]
      );
      if (latest.rows.length > 0) {
        currentPrice = parseFloat(latest.rows[0].close);
        priceAsOf = new Date(latest.rows[0].price_date).toISOString().split('T')[0];
        isDelisted = true;
      }
    }

    if (!currentPrice || currentPrice <= 0) {
      return res.status(503).json({ error: 'no_quote', message: `Could not determine a current or last-known price for ${symbol}.` });
    }

    const currentValue = totalShares * currentPrice;
    const totalReturnDollar = currentValue - totalInvested;
    const totalReturnPct = totalInvested > 0 ? (totalReturnDollar / totalInvested) * 100 : 0;

    return res.json({
      symbol,
      requested_date: date,
      purchase_date: purchaseDateStr,
      amount_invested: amount,
      monthly_contribution: monthly,
      contributions_made: contributionsMade,
      total_invested: Number(totalInvested.toFixed(2)),
      purchase_price: Number(purchasePrice.toFixed(4)),
      total_shares: Number(totalShares.toFixed(6)),
      current_price: Number(currentPrice.toFixed(4)),
      current_value: Number(currentValue.toFixed(2)),
      total_return_dollar: Number(totalReturnDollar.toFixed(2)),
      total_return_pct: Number(totalReturnPct.toFixed(2)),
      is_delisted: isDelisted,
      price_as_of: priceAsOf,
      contributions_stopped_at: firstSkippedMonth || null,
      // Legacy field kept for backwards compatibility with cached UIs
      shares_at_purchase: Number((amount / purchasePrice).toFixed(6)),
      as_of: new Date().toISOString()
    });
  } catch (err) {
    console.warn(`[TOOLS] what-if-invested failed for ${symbol} ${date}: ${err.message}`);
    if (err.message && err.message.toLowerCase().includes('rate-limit')) {
      return res.status(429).json({ error: 'rate_limited', message: 'Too many requests right now. Try again shortly.' });
    }
    return res.status(503).json({ error: 'lookup_failed', message: 'Could not look up this symbol. It may be unsupported or temporarily unavailable.' });
  }
}

async function symbolSearch(req, res) {
  try {
    const query = (typeof req.query.q === 'string' ? req.query.q : '').trim().toUpperCase();
    if (!query || query.length < 1) {
      return res.json({ results: [] });
    }
    if (query.length > 32) {
      return res.json({ results: [] });
    }

    const cacheKey = `tool_symbol_search:${query}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ results: cached });
    }

    const results = [];
    const seen = new Set();

    const localQuery = `
      SELECT symbol, company_name, exchange, logo
      FROM symbol_categories
      WHERE UPPER(symbol) LIKE $1
        OR UPPER(company_name) LIKE $2
      ORDER BY
        CASE WHEN UPPER(symbol) LIKE $1 THEN 0 ELSE 1 END,
        symbol
      LIMIT 10
    `;
    const localResult = await db.query(localQuery, [`${query}%`, `%${query}%`]);
    for (const row of localResult.rows) {
      const sym = row.symbol.toUpperCase();
      if (seen.has(sym)) continue;
      seen.add(sym);
      results.push({
        symbol: sym,
        company_name: row.company_name || null,
        exchange: row.exchange || null,
        logo: row.logo || null,
        source: 'local'
      });
    }

    if (results.length < 5 && query.length >= 2 && finnhub.isConfigured()) {
      try {
        const finnhubResults = await finnhub.searchSymbol(query);
        const items = finnhubResults?.result || (finnhubResults ? [finnhubResults] : []);
        for (const item of items) {
          if (results.length >= 15) break;
          const sym = (item.symbol || '').toUpperCase();
          if (!sym || sym.includes('.') || seen.has(sym)) continue;
          seen.add(sym);
          results.push({
            symbol: sym,
            company_name: item.description || null,
            exchange: null,
            logo: null,
            source: 'finnhub'
          });
        }
      } catch (err) {
        console.warn(`[TOOLS] Finnhub symbol search failed for "${query}": ${err.message}`);
      }
    }

    cache.set(cacheKey, results, SYMBOL_SEARCH_CACHE_TTL);
    return res.json({ results });
  } catch (err) {
    console.warn(`[TOOLS] symbol-search failed: ${err.message}`);
    return res.json({ results: [] });
  }
}

module.exports = { whatIfInvested, symbolSearch };
