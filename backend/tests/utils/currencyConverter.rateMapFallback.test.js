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
