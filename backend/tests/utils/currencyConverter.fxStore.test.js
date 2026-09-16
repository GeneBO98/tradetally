jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({ apiKey: null }));

const db = require('../../src/config/database');
const manualFxService = require('../../src/services/manualFxService');

const FRANKFURTER_LATEST = {
  amount: 1,
  base: 'USD',
  date: '2026-09-15',
  rates: { EUR: 0.86, GBP: 0.74, JPY: 147, CHF: 0.8 }
};

function freshConverter() {
  let mod;
  jest.isolateModules(() => {
    mod = require('../../src/utils/currencyConverter');
  });
  return mod;
}

describe('currencyConverter daily FX store', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    db.query.mockReset();
    // manualFxService is required lazily at call time, so it resolves from the
    // main module registry and survives jest.isolateModules. Without this its
    // 10s memo leaks one test's overrides into the next.
    manualFxService.clearRateCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function manualOnlyDb(rows) {
    db.query.mockImplementation(async sql => ({
      rows: sql.includes('FROM manual_fx_rates') ? rows : []
    }));
  }

  test('serves current rates from manual overrides with no provider or daily snapshot', async () => {
    manualOnlyDb([{ quote_code: 'EUR', per_usd: '0.8' }, { quote_code: 'GBP', per_usd: '0.7' }]);
    global.fetch = jest.fn(async () => { throw new Error('offline'); });
    const converter = freshConverter();
    expect(await converter.getDailyCrossRate('EUR', 'GBP')).toBeCloseTo(0.7 / 0.8);
    expect(await converter.getRateMap('USD')).toMatchObject({ USD: 1, EUR: 0.8, GBP: 0.7 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a dated lookup asks the provider first, then falls back to the override', async () => {
    manualOnlyDb([{ quote_code: 'EUR', per_usd: '0.8' }]);
    global.fetch = jest.fn(async () => { throw new Error('offline'); });
    const converter = freshConverter();

    // An override states today's rate; it must not silently rewrite a 2024
    // trade's conversion, so the provider is tried first.
    expect(await converter.getForexRate('EUR', 'USD', '2024-01-01')).toBeCloseTo(1 / 0.8);
    expect(global.fetch).toHaveBeenCalled();
  });

  test('a dated lookup prefers the published historical rate over the override', async () => {
    db.query.mockImplementation(async sql => ({
      rows: sql.includes('FROM manual_fx_rates') ? [{ quote_code: 'EUR', per_usd: '0.5' }] : []
    }));
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ base: 'EUR', date: '2024-01-01', rates: { USD: 1.1 } })
    }));
    const converter = freshConverter();

    expect(await converter.getForexRate('EUR', 'USD', '2024-01-01')).toBeCloseTo(1.1);
  });

  test('a current lookup falls back to the last stored snapshot when today is missing', async () => {
    db.query.mockImplementation(async sql => {
      if (sql.includes('FROM manual_fx_rates')) return { rows: [] };
      if (sql.includes('ORDER BY rate_date DESC')) {
        return { rows: [{ rates: { USD: 1, EUR: 0.9 }, rate_date: '2026-09-14' }] };
      }
      return { rows: [] };
    });
    global.fetch = jest.fn(async () => { throw new Error('offline'); });
    const converter = freshConverter();

    // SQL's trade_amount_usd() resolves the newest stored row, so the JS side
    // has to agree rather than switching normalization off at midnight.
    expect(await converter.getRateMap('USD')).toMatchObject({ USD: 1, EUR: 0.9 });
  });

  test('manual override wins over a provider daily snapshot for current rates', async () => {
    db.query.mockImplementation(async sql => ({
      rows: sql.includes('FROM manual_fx_rates')
        ? [{ quote_code: 'EUR', per_usd: '0.8' }]
        : [{ rates: { USD: 1, EUR: 0.9, GBP: 0.75 } }]
    }));
    const converter = freshConverter();
    expect(await converter.getDailyCrossRate('USD', 'EUR')).toBe(0.8);
    expect(await converter.getDailyCrossRate('EUR', 'GBP')).toBeCloseTo(0.75 / 0.8);
  });

  test('persists the full rate map once per day and reuses the stored row', async () => {
    const store = {};
    db.query.mockImplementation(async (sql, params) => {
      if (sql.trim().startsWith('SELECT')) {
        const key = `${params[0]}|${params[1]}`;
        return store[key] ? { rows: [{ rates: store[key] }] } : { rows: [] };
      }
      store[`${params[0]}|${params[1]}`] = JSON.parse(params[3]);
      return { rows: [] };
    });

    let apiCalls = 0;
    global.fetch = jest.fn(async () => {
      apiCalls += 1;
      return { ok: true, json: async () => FRANKFURTER_LATEST };
    });

    const converter = freshConverter();

    const rate = await converter.getForexRateFromFrankfurter('USD', 'EUR');
    expect(rate).toBe(0.86);
    expect(apiCalls).toBe(1);
    expect(Object.keys(store)).toHaveLength(1);

    // A fresh module instance (empty in-memory cache) must read the DB row,
    // not hit the network again - this is the "one fetch per day" contract.
    const converter2 = freshConverter();
    const gbp = await converter2.getForexRateFromFrankfurter('USD', 'GBP');
    expect(gbp).toBe(0.74);
    expect(apiCalls).toBe(1);
  });

  test('computes cross rates from the single USD map without extra API calls', async () => {
    db.query.mockResolvedValue({
      rows: [{ rates: { USD: 1.0, EUR: 0.86, GBP: 0.74, JPY: 147 } }]
    });
    global.fetch = jest.fn(async () => {
      throw new Error('network must not be used when the store has the day');
    });

    const converter = freshConverter();
    const eurGbp = await converter.getDailyCrossRate('EUR', 'GBP');
    expect(eurGbp).toBeCloseTo(0.74 / 0.86, 6);
    expect(converter.getDailyCrossRate('USD', 'USD')).resolves.toBe(1.0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('historical trade-date rates are fetched once and persisted under the requested date', async () => {
    const stored = new Map();
    db.query.mockImplementation(async (sql, params) => {
      if (sql.trim().startsWith('SELECT')) {
        const key = `${params[0]}|${params[1]}`;
        return stored.has(key) ? { rows: [{ rates: stored.get(key) }] } : { rows: [] };
      }
      stored.set(`${params[0]}|${params[1]}`, JSON.parse(params[3]));
      return { rows: [] };
    });

    let apiCalls = 0;
    global.fetch = jest.fn(async () => {
      apiCalls += 1;
      return {
        ok: true,
        json: async () => ({ amount: 1, base: 'EUR', date: '2025-01-03', rates: { USD: 1.03, GBP: 0.83, JPY: 155 } })
      };
    });

    const converter = freshConverter();
    const r1 = await converter.getForexRateFromFrankfurter('EUR', 'USD', '2025-01-03');
    const r2 = await converter.getForexRateFromFrankfurter('EUR', 'JPY', '2025-01-03');
    expect(r1).toBe(1.03);
    expect(r2).toBe(155);
    expect(apiCalls).toBe(1);
    expect(stored.has('EUR|2025-01-03')).toBe(true);
  });

  describe('refreshCurrentRates', () => {
    function boot({ hasTodayRow, hasNativeRows }) {
      const calls = [];
      db.query.mockImplementation(async (sql, params) => {
        calls.push(sql.replace(/\s+/g, ' ').trim());
        if (sql.includes('FROM manual_fx_rates')) return { rows: [] };
        if (sql.includes('has_native_rows')) return { rows: [{ has_native_rows: hasNativeRows }] };
        if (sql.includes('ORDER BY rate_date DESC')) return { rows: [] };
        if (sql.trim().startsWith('SELECT')) return { rows: hasTodayRow ? [{ rates: { USD: 1, EUR: 0.9 } }] : [] };
        return { rows: [] };
      });
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => FRANKFURTER_LATEST
      }));
      return calls;
    }

    test('drops cached aggregates when a new snapshot lands and native rows exist', async () => {
      const calls = boot({ hasTodayRow: false, hasNativeRows: true });
      const summary = await freshConverter().refreshCurrentRates();

      expect(summary.refreshed).toBe(true);
      expect(calls.some(sql => sql.startsWith('DELETE FROM analytics_cache'))).toBe(true);
    });

    test('keeps caches when every trade is already USD', async () => {
      const calls = boot({ hasTodayRow: false, hasNativeRows: false });
      await freshConverter().refreshCurrentRates();

      expect(calls.some(sql => sql.startsWith('DELETE FROM analytics_cache'))).toBe(false);
    });

    test('a restart on a day already stored refreshes nothing', async () => {
      const calls = boot({ hasTodayRow: true, hasNativeRows: true });
      const summary = await freshConverter().refreshCurrentRates();

      expect(summary.refreshed).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(calls.some(sql => sql.startsWith('DELETE FROM analytics_cache'))).toBe(false);
    });
  });

  test('getDailyCrossRate falls back to pairwise lookup for currencies missing from the USD map', async () => {
    db.query.mockImplementation(async (sql, params) => {
      if (sql.trim().startsWith('SELECT')) {
        if (params[0] === 'USD') return { rows: [{ rates: { USD: 1.0, EUR: 0.86 } }] };
        return { rows: [] };
      }
      return { rows: [] };
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ base: 'TRY', date: '2026-09-15', rates: { USD: 0.03, EUR: 0.026, GBP: 0.022 } })
    }));

    const converter = freshConverter();
    const rate = await converter.getDailyCrossRate('TRY', 'EUR');
    expect(rate).toBeCloseTo(0.026, 6);
  });
});
