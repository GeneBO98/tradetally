const db = require('../config/database');
const finnhub = require('../utils/finnhub');
const cache = require('../utils/cache');

const CACHE_TTL = 300000; // 5 minutes

async function searchSymbols(req, res) {
  try {
    const userId = req.user.id;
    const query = (req.query.q || '').trim().toUpperCase();

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
      SELECT DISTINCT t.symbol, sc.company_name, sc.exchange
      FROM trades t
      LEFT JOIN symbol_categories sc ON UPPER(t.symbol) = UPPER(sc.symbol)
      WHERE t.user_id = $1
        AND UPPER(t.symbol) LIKE $2
      ORDER BY t.symbol
      LIMIT 10
    `;
    const userTradesResult = await db.query(userTradesQuery, [userId, `${query}%`]);

    for (const row of userTradesResult.rows) {
      const sym = row.symbol.toUpperCase();
      if (!seenSymbols.has(sym)) {
        seenSymbols.add(sym);
        results.push({
          symbol: sym,
          company_name: row.company_name || null,
          exchange: row.exchange || null,
          source: 'user_trades'
        });
      }
    }

    // 2. Search symbol_categories table
    if (results.length < 10) {
      const limit = 10 - results.length;
      const localQuery = `
        SELECT symbol, company_name, exchange
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
        if (!seenSymbols.has(sym)) {
          seenSymbols.add(sym);
          results.push({
            symbol: sym,
            company_name: row.company_name || null,
            exchange: row.exchange || null,
            source: 'local'
          });
        }
      }
    }

    // 3. Finnhub fallback - only if few local results and query >= 2 chars
    if (results.length < 5 && query.length >= 2 && finnhub.isConfigured()) {
      try {
        const finnhubResults = await finnhub.symbolSearch(query);
        if (finnhubResults && finnhubResults.result) {
          for (const item of finnhubResults.result) {
            if (results.length >= 15) break;
            const sym = (item.symbol || '').toUpperCase();
            // Skip symbols with dots (foreign exchanges) and already-seen
            if (!sym || sym.includes('.') || seenSymbols.has(sym)) continue;
            seenSymbols.add(sym);
            results.push({
              symbol: sym,
              company_name: item.description || null,
              exchange: null,
              source: 'finnhub'
            });
          }
        }
      } catch (err) {
        // Graceful degradation - return local results only
        console.warn(`[SYMBOLS] Finnhub search failed for "${query}": ${err.message}`);
      }
    }

    // Cache the results
    cache.set(cacheKey, results, CACHE_TTL);

    return res.json({ results });
  } catch (error) {
    console.error('[SYMBOLS] Search error:', error.message);
    return res.status(500).json({ error: 'Failed to search symbols' });
  }
}

module.exports = {
  searchSymbols
};
