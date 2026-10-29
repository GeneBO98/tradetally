jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/utils/finnhub', () => ({
  isFinnhub: true,
  isConfigured: jest.fn(() => true),
  getEarningsCalendar: jest.fn()
}));

const db = require('../../src/config/database');
const finnhub = require('../../src/utils/finnhub');
const EarningsService = require('../../src/services/earningsService');

describe('EarningsService.fetchWindow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    finnhub.isFinnhub = true;
  });

  test('enumerateDays is inclusive and timezone-safe', () => {
    expect(EarningsService.enumerateDays('2026-10-29', '2026-11-01')).toEqual([
      '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'
    ]);
    expect(EarningsService.enumerateDays('2026-11-05', '2026-11-05')).toEqual(['2026-11-05']);
  });

  test('fetches Finnhub one day at a time and merges, dropping duplicates', async () => {
    finnhub.getEarningsCalendar.mockImplementation(async (from) => {
      if (from === '2026-10-29') return [{ symbol: 'AAA', date: '2026-10-29' }, { symbol: 'BBB', date: '2026-10-29' }];
      if (from === '2026-10-30') return [{ symbol: 'bbb', date: '2026-10-29' }, { symbol: 'CCC', date: '2026-10-30' }];
      return [];
    });

    const rows = await EarningsService.fetchWindow('2026-10-29', '2026-10-31');

    expect(finnhub.getEarningsCalendar).toHaveBeenCalledTimes(3);
    expect(finnhub.getEarningsCalendar).toHaveBeenNthCalledWith(1, '2026-10-29', '2026-10-29');
    expect(finnhub.getEarningsCalendar).toHaveBeenNthCalledWith(3, '2026-10-31', '2026-10-31');
    expect(rows.map(r => `${r.symbol}|${r.date}`)).toEqual([
      'AAA|2026-10-29', 'BBB|2026-10-29', 'CCC|2026-10-30'
    ]);
  });

  test('keeps a single request for non-Finnhub providers', async () => {
    finnhub.isFinnhub = false;
    finnhub.getEarningsCalendar.mockResolvedValueOnce([{ symbol: 'AAA', date: '2026-10-29' }]);

    const rows = await EarningsService.fetchWindow('2026-10-29', '2026-11-12');

    expect(finnhub.getEarningsCalendar).toHaveBeenCalledTimes(1);
    expect(finnhub.getEarningsCalendar).toHaveBeenCalledWith('2026-10-29', '2026-11-12');
    expect(rows).toHaveLength(1);
  });

  test('fetchAndCache stores the merged window and returns null on provider failure', async () => {
    jest.spyOn(EarningsService, 'getDateRange').mockReturnValue({ from: '2026-10-29', to: '2026-10-30' });
    finnhub.getEarningsCalendar
      .mockResolvedValueOnce([{ symbol: 'AAA', date: '2026-10-29' }])
      .mockResolvedValueOnce([{ symbol: 'BBB', date: '2026-10-30' }]);
    db.query.mockResolvedValueOnce({ rows: [] });

    const stored = await EarningsService.fetchAndCache();

    expect(stored).toHaveLength(2);
    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe('2026-10-29');
    expect(params[1]).toBe('2026-10-30');
    expect(JSON.parse(params[2])).toHaveLength(2);

    finnhub.getEarningsCalendar.mockRejectedValueOnce(new Error('rate limited'));
    await expect(EarningsService.fetchAndCache()).resolves.toBeNull();

    EarningsService.getDateRange.mockRestore();
  });
});
