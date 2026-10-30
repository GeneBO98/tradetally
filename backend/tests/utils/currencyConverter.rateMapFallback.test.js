jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/manualFxService', () => ({ getRateMap: jest.fn().mockResolvedValue({}) }));

const { query } = require('../../src/config/database');
const currencyConverter = require('../../src/utils/currencyConverter');

const today = new Date().toISOString().split('T')[0];
const okResponse = (body) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });
const failedResponse = { ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) };

const insertCall = () => query.mock.calls.find(([sql]) => sql.includes('INSERT INTO fx_daily_rates'));

describe('getRateMap provider fallback', () => {
  beforeEach(() => {
    currencyConverter.clearRateCache();
    query.mockReset();
    query.mockResolvedValue({ rows: [] }); // empty store; persist is a no-op INSERT
    global.fetch = jest.fn();
  });

  afterAll(() => {
    delete global.fetch;
  });

  test('uses Frankfurter first and stores the map with source frankfurter', async () => {
    fetch.mockResolvedValueOnce(okResponse({ date: today, rates: { EUR: 0.9 } }));

    const rates = await currencyConverter.getRateMap('USD');

    expect(rates).toEqual({ USD: 1.0, EUR: 0.9 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(`https://api.frankfurter.dev/v1/latest?base=USD`);
    expect(insertCall()[1][4]).toBe('frankfurter');
  });

  test('falls back to AllRatesToday for a current lookup when Frankfurter fails', async () => {
    fetch
      .mockResolvedValueOnce(failedResponse)
      .mockResolvedValueOnce(okResponse({ result: 'success', base_code: 'USD', date: today, rates: { EUR: 0.91 } }));

    const rates = await currencyConverter.getRateMap('USD');

    expect(rates).toEqual({ USD: 1.0, EUR: 0.91 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe('https://allratestoday.com/api/open/latest/USD');
    const [, params] = insertCall();
    expect(params[2]).toBe(today);
    expect(params[4]).toBe('allratestoday');
  });

  test('keeps a dated lookup Frankfurter-only (historical rates are not keyless)', async () => {
    fetch.mockResolvedValueOnce(failedResponse);

    await expect(currencyConverter.getRateMap('USD', '2024-03-15')).rejects.toThrow('Frankfurter API error: 503');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(insertCall()).toBeUndefined();
  });

  test('surfaces an AllRatesToday error body instead of storing an empty map', async () => {
    fetch
      .mockResolvedValueOnce(failedResponse)
      .mockResolvedValueOnce(okResponse({ error: 'unsupported base' }));

    await expect(currencyConverter.getRateMap('XXX')).rejects.toThrow('unsupported base');
    expect(insertCall()).toBeUndefined();
  });
});

// A fetch that never answers until its abort signal fires, like a stalled
// provider. Rejects with the AbortError undici raises on abort.
const stalledFetch = () => (url, { signal } = {}) => new Promise((resolve, reject) => {
  const abort = () => {
    const error = new Error('This operation was aborted');
    error.name = 'AbortError';
    reject(error);
  };
  if (signal?.aborted) return abort();
  signal?.addEventListener('abort', abort, { once: true });
});

describe('getRateMap provider timeouts', () => {
  const storedMap = { USD: 1.0, EUR: 0.88 };
  const storedRow = { rates: storedMap, rate_date: '2026-10-27', source: 'allratestoday' };

  beforeEach(() => {
    currencyConverter.clearRateCache();
    query.mockReset();
    process.env.FX_PROVIDER_TIMEOUT_MS = '25';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete process.env.FX_PROVIDER_TIMEOUT_MS;
  });

  afterAll(() => {
    delete global.fetch;
  });

  test('a stalled Frankfurter request times out and reaches AllRatesToday', async () => {
    query.mockResolvedValue({ rows: [] });
    fetch
      .mockImplementationOnce(stalledFetch())
      .mockResolvedValueOnce(okResponse({ result: 'success', base_code: 'USD', date: today, rates: { EUR: 0.91 } }));

    const rates = await currencyConverter.getRateMap('USD');

    expect(rates).toEqual({ USD: 1.0, EUR: 0.91 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetch.mock.calls[1][0]).toBe('https://allratestoday.com/api/open/latest/USD');
    expect(insertCall()[1][4]).toBe('allratestoday');
  });

  test('a stalled AllRatesToday fallback times out and returns the last stored map without persisting', async () => {
    // No row for today; one older stored row to fall back on.
    query.mockImplementation(async (sql) => {
      if (sql.includes('ORDER BY rate_date DESC')) return { rows: [storedRow] };
      return { rows: [] };
    });
    fetch
      .mockResolvedValueOnce(failedResponse)
      .mockImplementationOnce(stalledFetch());

    const rates = await currencyConverter.getRateMap('USD');

    expect(rates).toEqual(storedMap);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(insertCall()).toBeUndefined();
  });

  test('a stalled response body read is also bounded by the timeout', async () => {
    query.mockResolvedValue({ rows: [] });
    fetch
      .mockImplementationOnce((url, { signal }) => Promise.resolve({
        ok: true, status: 200, statusText: 'OK',
        json: () => stalledFetch()(url, { signal })
      }))
      .mockResolvedValueOnce(okResponse({ result: 'success', base_code: 'USD', date: today, rates: { EUR: 0.92 } }));

    const rates = await currencyConverter.getRateMap('USD');

    expect(rates).toEqual({ USD: 1.0, EUR: 0.92 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('a dated lookup still times out Frankfurter-only', async () => {
    query.mockResolvedValue({ rows: [] });
    fetch.mockImplementationOnce(stalledFetch());

    await expect(currencyConverter.getRateMap('USD', '2024-03-15')).rejects.toThrow('Frankfurter API timed out after 25ms');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(insertCall()).toBeUndefined();
  });
});

describe('getCurrentRateSource attribution', () => {
  beforeEach(() => {
    currencyConverter.clearRateCache();
    query.mockReset();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    delete global.fetch;
  });

  test('Frankfurter data needs no attribution', async () => {
    query.mockResolvedValue({ rows: [] });
    fetch.mockResolvedValueOnce(okResponse({ date: today, rates: { EUR: 0.9 } }));

    await expect(currencyConverter.getCurrentRateSource('USD')).resolves.toEqual({
      source: 'frankfurter', rateDate: today, attribution: null
    });
  });

  test('a fresh AllRatesToday map carries the required link', async () => {
    query.mockResolvedValue({ rows: [] });
    fetch
      .mockResolvedValueOnce(failedResponse)
      .mockResolvedValueOnce(okResponse({ result: 'success', base_code: 'USD', date: today, rates: { EUR: 0.91 } }));

    await expect(currencyConverter.getCurrentRateSource('USD')).resolves.toEqual({
      source: 'allratestoday', rateDate: today,
      attribution: { name: 'AllRatesToday', url: 'https://allratestoday.com/' }
    });
  });

  test("today's stored row reports the persisted source", async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('WHERE base_code = $1 AND rate_date = $2')) return { rows: [{ rates: { USD: 1, EUR: 0.9 }, source: 'allratestoday' }] };
      return { rows: [] };
    });

    const result = await currencyConverter.getCurrentRateSource('USD');

    expect(fetch).not.toHaveBeenCalled();
    expect(result.source).toBe('allratestoday');
    expect(result.attribution.url).toBe('https://allratestoday.com/');
  });

  test('a reused last-stored AllRatesToday map keeps the attribution while providers are down', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('ORDER BY rate_date DESC')) return { rows: [{ rates: { USD: 1, EUR: 0.88 }, rate_date: '2026-10-27', source: 'allratestoday' }] };
      return { rows: [] };
    });
    fetch.mockResolvedValueOnce(failedResponse).mockResolvedValueOnce(failedResponse);

    await expect(currencyConverter.getCurrentRateSource('USD')).resolves.toEqual({
      source: 'allratestoday', rateDate: '2026-10-27',
      attribution: { name: 'AllRatesToday', url: 'https://allratestoday.com/' }
    });
  });

  test('a Date rate_date from pg is reported as YYYY-MM-DD', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('ORDER BY rate_date DESC')) return { rows: [{ rates: { USD: 1 }, rate_date: new Date('2026-10-27T00:00:00Z'), source: 'frankfurter' }] };
      return { rows: [] };
    });
    fetch.mockResolvedValueOnce(failedResponse).mockResolvedValueOnce(failedResponse);

    await expect(currencyConverter.getCurrentRateSource('USD')).resolves.toMatchObject({ rateDate: '2026-10-27', attribution: null });
  });
});
