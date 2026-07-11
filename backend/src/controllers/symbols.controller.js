const db = require('../config/database');
const finnhub = require('../utils/finnhub');
const cache = require('../utils/cache');
const symbolCategories = require('../utils/symbolCategories');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const CACHE_TTL = 300000; // 5 minutes

function normalizeSymbolsParam(symbolsParam) {
  if (typeof symbolsParam !== 'string') {
    return [];
  }

  return [...new Set(
    symbolsParam
      .split(',')
      .map(symbol => symbol.trim().toUpperCase())
      .filter(Boolean)
  )].slice(0, 100);
}

function applyCategoryMetadata(target, category) {
  if (!target || !category) {
    return target;
  }

  return {
    ...target,
    company_name: target.company_name || category.company_name || null,
    ...(Object.prototype.hasOwnProperty.call(target, 'companyName')
      ? { companyName: target.companyName || category.company_name || null }
      : {}),
    exchange: target.exchange || category.exchange || null,
    logo: target.logo || category.logo || null
  };
}

function isOptionContractSymbol(symbol) {
  const compact = String(symbol || '').toUpperCase().replace(/\s+/g, '');
  return /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(compact);
}

function isSupportedProviderResult(item) {
  const symbol = String(item?.symbol || '').trim().toUpperCase();
  if (!symbol || symbol.includes('.') || isOptionContractSymbol(symbol)) {
    return false;
  }

  // Finnhub labels search results by instrument class. Price alerts operate on
  // underlyings, so exclude contracts, warrants, rights, preferred shares, and
  // other derivative-like instruments from this stock/ETF picker.
  if (finnhub.isFinnhub) {
    const type = String(item.type || '').trim().toLowerCase();
    const supportedTypes = new Set([
      'common stock',
      'etp',
      'adr',
      'reit',
      'closed-end fund',
      'open-end fund'
    ]);
    return supportedTypes.has(type);
  }

  return true;
}

async function searchSymbols(req, res) {
  try {
    const userId = req.user.id;
    const query = (typeof req.query.q === 'string' ? req.query.q : '').trim().toUpperCase();

    if (!query || query.length < 1) {
      return res.json({ results: [] });
    }

    // Check cache first
    const cacheKey = `symbol_search:${userId}:${query}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ results: cached });
    }

    const results = [];
    const seenSymbols = new Set();

    // 1. Search user's traded symbols (highest priority)
    const userTradesQuery = `
      SELECT DISTINCT
        UPPER(COALESCE(NULLIF(t.underlying_symbol, ''), t.symbol)) AS symbol,
        sc.company_name,
        sc.exchange,
        sc.logo
      FROM trades t
      LEFT JOIN symbol_categories sc
        ON UPPER(COALESCE(NULLIF(t.underlying_symbol, ''), t.symbol)) = UPPER(sc.symbol)
      WHERE t.user_id = $1
        AND UPPER(COALESCE(NULLIF(t.underlying_symbol, ''), t.symbol)) LIKE $2
        AND (
          t.instrument_type IS DISTINCT FROM 'option'
          OR NULLIF(t.underlying_symbol, '') IS NOT NULL
        )
      ORDER BY symbol
      LIMIT 10
    `;
    const userTradesResult = await db.query(userTradesQuery, [userId, `${query}%`]);

    for (const row of userTradesResult.rows) {
      const sym = row.symbol.toUpperCase();
      if (!isOptionContractSymbol(sym) && !seenSymbols.has(sym)) {
        seenSymbols.add(sym);
        results.push({
          symbol: sym,
          company_name: row.company_name || null,
          exchange: row.exchange || null,
          logo: row.logo || null,
          source: 'user_trades'
        });
      }
    }

    const missingUserTradeSymbols = results
      .filter(result => result.source === 'user_trades' && !result.company_name && !result.logo)
      .map(result => result.symbol);

    if (missingUserTradeSymbols.length > 0) {
      const hydratedCategories = await symbolCategories.getSymbolCategories(missingUserTradeSymbols);
      for (const result of results) {
        if (result.source !== 'user_trades' || (result.company_name || result.logo)) {
          continue;
        }

        const category = hydratedCategories.get(result.symbol);
        if (category) {
          Object.assign(result, applyCategoryMetadata(result, category));
        }
      }
    }

    // 2. Search symbol_categories table
    if (results.length < 10) {
      const limit = 10 - results.length;
      const localQuery = `
        SELECT symbol, company_name, exchange, logo
        FROM symbol_categories
        WHERE UPPER(symbol) LIKE $1
          OR UPPER(company_name) LIKE $2
        ORDER BY
          CASE WHEN UPPER(symbol) LIKE $1 THEN 0 ELSE 1 END,
          symbol
        LIMIT $3
      `;
      const localResult = await db.query(localQuery, [`${query}%`, `%${query}%`, limit]);

      for (const row of localResult.rows) {
        const sym = row.symbol.toUpperCase();
        if (!isOptionContractSymbol(sym) && !seenSymbols.has(sym)) {
          seenSymbols.add(sym);
          results.push({
            symbol: sym,
            company_name: row.company_name || null,
            exchange: row.exchange || null,
            logo: row.logo || null,
            source: 'local'
          });
        }
      }
    }

    // 3. Market data provider fallback - only if few local results and query >= 2 chars
    if (results.length < 5 && query.length >= 2 && finnhub.isConfigured()) {
      try {
        const finnhubResults = await finnhub.symbolSearch(query);
        if (finnhubResults && finnhubResults.result) {
          for (const item of finnhubResults.result) {
            if (results.length >= 15) break;
            const sym = (item.symbol || '').toUpperCase();
            if (!isSupportedProviderResult(item) || seenSymbols.has(sym)) continue;
            seenSymbols.add(sym);
            results.push({
              symbol: sym,
              company_name: item.description || null,
              exchange: null,
              logo: null,
              source: finnhub.providerName || 'finnhub'
            });
          }
        }
      } catch (err) {
        // Graceful degradation - return local results only
        console.warn(`[SYMBOLS] ${finnhub.displayName || 'Market data'} search failed for "${query}": ${err.message}`);
      }
    }

    // Cache the results
    cache.set(cacheKey, results, CACHE_TTL);

    return res.json({ results });
  } catch (error) {
    console.error('[SYMBOLS] Search error:', error.message);
    throw new AppError(500, { error: 'Failed to search symbols' });
  }
}

async function getSymbolMetadata(req, res) {
  try {
    const symbols = normalizeSymbolsParam(req.query.symbols);

    if (symbols.length === 0) {
      return res.json({ metadata: {} });
    }

    const cacheKey = `symbol_metadata:${symbols.join(',')}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ metadata: cached });
    }

    const metadata = Object.fromEntries(
      symbols.map(symbol => [symbol, {
        symbol,
        companyName: null,
        exchange: null,
        logo: null
      }])
    );

    const query = `
      WITH requested_symbols AS (
        SELECT UNNEST($1::text[]) AS symbol
      ),
      latest_analysis AS (
        SELECT DISTINCT ON (UPPER(symbol))
          UPPER(symbol) AS symbol,
          company_name,
          logo
        FROM eight_pillars_analysis
        WHERE UPPER(symbol) = ANY($1::text[])
        ORDER BY UPPER(symbol), analysis_date DESC
      )
      SELECT
        rs.symbol,
        COALESCE(sc.company_name, la.company_name) AS company_name,
        sc.exchange,
        COALESCE(sc.logo, la.logo) AS logo
      FROM requested_symbols rs
      LEFT JOIN symbol_categories sc ON UPPER(sc.symbol) = rs.symbol
      LEFT JOIN latest_analysis la ON la.symbol = rs.symbol
    `;
    const result = await db.query(query, [symbols]);

    for (const row of result.rows) {
      metadata[row.symbol] = {
        symbol: row.symbol,
        companyName: row.company_name || null,
        exchange: row.exchange || null,
        logo: row.logo || null
      };
    }

    const symbolsMissingMetadata = symbols.filter(symbol => {
      const entry = metadata[symbol];
      return entry && !entry.companyName && !entry.logo;
    });

    if (symbolsMissingMetadata.length > 0) {
      const hydratedCategories = await symbolCategories.getSymbolCategories(symbolsMissingMetadata);
      for (const symbol of symbolsMissingMetadata) {
        const category = hydratedCategories.get(symbol);
        if (!category) {
          continue;
        }

        metadata[symbol] = {
          symbol,
          companyName: metadata[symbol].companyName || category.company_name || null,
          exchange: metadata[symbol].exchange || category.exchange || null,
          logo: metadata[symbol].logo || category.logo || null
        };
      }
    }

    cache.set(cacheKey, metadata, CACHE_TTL);

    return res.json({ metadata });
  } catch (error) {
    console.error('[SYMBOLS] Metadata error:', error.message);
    throw new AppError(500, { error: 'Failed to fetch symbol metadata' });
  }
}

async function getSymbolQuote(req, res) {
  const userId = req.user.id;
  const symbol = (typeof req.query.symbol === 'string' ? req.query.symbol : '')
    .trim()
    .toUpperCase();

  if (!symbol) {
    throw new AppError(400, { error: 'Symbol is required' });
  }

  const quote = await finnhub.getQuote(symbol, userId);
  const currentPrice = Number(quote?.c);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new AppError(404, { error: `Current price unavailable for ${symbol}` });
  }

  const numberOrNull = value => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  return res.json({
    symbol,
    current_price: currentPrice,
    previous_close: numberOrNull(quote.pc),
    change: numberOrNull(quote.d),
    change_percent: numberOrNull(quote.dp),
    timestamp: numberOrNull(quote.t)
  });
}

module.exports = {
  searchSymbols: asyncHandler(searchSymbols),
  getSymbolMetadata: asyncHandler(getSymbolMetadata),
  getSymbolQuote: asyncHandler(getSymbolQuote)
};
