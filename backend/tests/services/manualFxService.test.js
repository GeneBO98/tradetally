jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/cache', () => ({ flush: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({ clearRateCache: jest.fn() }));

const db = require('../../src/config/database');
const cache = require('../../src/utils/cache');
const converter = require('../../src/utils/currencyConverter');
const service = require('../../src/services/manualFxService');

beforeEach(() => jest.clearAllMocks());

test('saves a validated server-wide rate and clears derived caches', async () => {
  db.query.mockResolvedValueOnce({ rows: [{ quote_code: 'EUR', per_usd: '0.8' }] }).mockResolvedValue({ rows: [] });
  await expect(service.saveRate('eur', 0.8)).resolves.toMatchObject({ quote_code: 'EUR' });
  expect(db.query.mock.calls[0][1]).toEqual(['EUR', 0.8]);
  expect(db.query.mock.calls[1][0]).toBe('DELETE FROM analytics_cache');
  expect(converter.clearRateCache).toHaveBeenCalledTimes(1);
  expect(cache.flush).toHaveBeenCalledTimes(1);
});

test.each([['USD', 1], ['AB', 1], ['EUR', 0], ['EUR', -1], ['EUR', Infinity]])(
  'rejects invalid override %s=%s without writing', async (code, rate) => {
    await expect(service.saveRate(code, rate)).rejects.toMatchObject({ name: 'ValidationError' });
    expect(db.query).not.toHaveBeenCalled();
  }
);

test('deleting a rate clears derived caches only when a row was removed', async () => {
  db.query.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 0 });
  await expect(service.deleteRate('eur')).resolves.toBe(true);
  expect(converter.clearRateCache).toHaveBeenCalledTimes(1);
  expect(cache.flush).toHaveBeenCalledTimes(1);
  await expect(service.deleteRate('eur')).resolves.toBe(false);
  expect(converter.clearRateCache).toHaveBeenCalledTimes(1);
});
