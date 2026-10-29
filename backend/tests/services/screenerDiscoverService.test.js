jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/earningsService', () => ({
  getDateRange: jest.fn(() => ({ from: '2026-10-29', to: '2026-11-12' })),
  getEarningsForSymbols: jest.fn()
}));
jest.mock('../../src/services/eightPillarsService', () => ({
  CALCULATION_VERSION: 8
}));
jest.mock('../../src/services/stockScannerService', () => ({
  needsRescan: jest.fn(() => Promise.resolve({ needed: false, reason: null }))
}));

const db = require('../../src/config/database');
const EarningsService = require('../../src/services/earningsService');
const StockScannerService = require('../../src/services/stockScannerService');
const ScreenerDiscoverService = require('../../src/services/screenerDiscoverService');

const row = (overrides = {}) => ({
  symbol: 'ABC',
  company_name: 'ABC Corp',
  industry: 'Technology',
  logo: null,
  pillars_passed: 7,
  pillar1_value: '12.34',
  pillar1_passed: true,
  pillar8_value: '15.00',
  market_cap: '1500000000.00',
  current_price: '42.5000',
  analysis_date: '2026-10-01T00:00:00.000Z',
  ...overrides
});

describe('ScreenerDiscoverService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
  });

  describe('clampLimit', () => {
    test('defaults and caps the per-list limit', () => {
      expect(ScreenerDiscoverService.clampLimit(undefined)).toBe(8);
      expect(ScreenerDiscoverService.clampLimit('abc')).toBe(8);
      expect(ScreenerDiscoverService.clampLimit(0)).toBe(8);
      expect(ScreenerDiscoverService.clampLimit('5')).toBe(5);
      expect(ScreenerDiscoverService.clampLimit(500)).toBe(25);
    });
  });

  describe('formatRow', () => {
    test('converts numerics and maps the 999.99 P/E sentinel to null', () => {
      const formatted = ScreenerDiscoverService.formatRow(row({ pillar1_value: '999.99' }));
      expect(formatted).toMatchObject({
        symbol: 'ABC',
        companyName: 'ABC Corp',
        pillarsPassed: 7,
        fiveYearPe: null,
        priceToFcf: 15,
        marketCap: 1500000000,
        currentPrice: 42.5
      });
      expect(ScreenerDiscoverService.formatRow(row()).fiveYearPe).toBe(12.34);
    });
  });

  describe('getLowestPeValuePicks', () => {
    test('queries strong-pillar stocks ordered by P/E with a market cap floor', async () => {
      db.query.mockResolvedValueOnce({ rows: [row({ symbol: 'LOW', pillar1_value: '5.10' })] });

      const picks = await ScreenerDiscoverService.getLowestPeValuePicks(8);

      expect(picks).toHaveLength(1);
      expect(picks[0]).toMatchObject({ symbol: 'LOW', fiveYearPe: 5.1 });
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toMatch(/pillar1_passed = true/);
      expect(sql).toMatch(/ORDER BY pillar1_value ASC/);
      // Only current-formula rows inside the freshness window qualify
      expect(sql).toMatch(/calculationVersion'\)::int = \$2/);
      expect(params).toEqual([120, 8, 6, 250000000, 8]);
    });
  });

  describe('getMostPillarsPassed', () => {
    test('orders by pillars passed then market cap', async () => {
      db.query.mockResolvedValueOnce({ rows: [row({ symbol: 'BIG', pillars_passed: 8 })] });

      const picks = await ScreenerDiscoverService.getMostPillarsPassed(8);

      expect(picks[0]).toMatchObject({ symbol: 'BIG', pillarsPassed: 8 });
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toMatch(/ORDER BY pillars_passed DESC, market_cap DESC NULLS LAST/);
      expect(params).toEqual([120, 8, 7, 8]);
    });
  });

  describe('getUpcomingEarnings', () => {
    test('returns empty without calling earnings when no quality candidates exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const picks = await ScreenerDiscoverService.getUpcomingEarnings(8);

      expect(picks).toEqual([]);
      expect(EarningsService.getEarningsForSymbols).not.toHaveBeenCalled();
    });

    test('joins candidates to the earnings calendar, one entry per symbol, soonest first', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          row({ symbol: 'AAA', pillars_passed: 6 }),
          row({ symbol: 'BBB', pillars_passed: 5 }),
          row({ symbol: 'CCC', pillars_passed: 8 })
        ]
      });
      EarningsService.getEarningsForSymbols.mockResolvedValueOnce([
        { symbol: 'bbb', date: '2026-10-30', hour: 'amc', epsEstimate: 1.2, revenueEstimate: 500 },
        { symbol: 'AAA', date: '2026-11-02', hour: 'bmo', epsEstimate: null, revenueEstimate: null },
        { symbol: 'AAA', date: '2026-11-09', hour: '', epsEstimate: null, revenueEstimate: null },
        { symbol: 'ZZZ', date: '2026-11-01', hour: '', epsEstimate: null, revenueEstimate: null }
      ]);

      const picks = await ScreenerDiscoverService.getUpcomingEarnings(8);

      expect(EarningsService.getEarningsForSymbols).toHaveBeenCalledWith(['AAA', 'BBB', 'CCC']);
      expect(picks.map(p => p.symbol)).toEqual(['BBB', 'AAA']);
      expect(picks[0]).toMatchObject({
        symbol: 'BBB',
        earningsDate: '2026-10-30',
        earningsHour: 'amc',
        epsEstimate: 1.2,
        revenueEstimate: 500,
        pillarsPassed: 5
      });
      expect(picks[1].earningsHour).toBe('bmo');
    });

    test('skips entries that have already reported', async () => {
      db.query.mockResolvedValueOnce({ rows: [row({ symbol: 'AAA' }), row({ symbol: 'BBB' })] });
      EarningsService.getEarningsForSymbols.mockResolvedValueOnce([
        { symbol: 'AAA', date: '2026-10-29', epsActual: 1.01, epsEstimate: 0.9 },
        { symbol: 'BBB', date: '2026-10-29', epsActual: null, epsEstimate: 0.5 }
      ]);

      const picks = await ScreenerDiscoverService.getUpcomingEarnings(8);
      expect(picks.map(p => p.symbol)).toEqual(['BBB']);
    });

    test('respects the limit', async () => {
      db.query.mockResolvedValueOnce({
        rows: [row({ symbol: 'AAA' }), row({ symbol: 'BBB' }), row({ symbol: 'CCC' })]
      });
      EarningsService.getEarningsForSymbols.mockResolvedValueOnce([
        { symbol: 'AAA', date: '2026-10-30' },
        { symbol: 'BBB', date: '2026-10-31' },
        { symbol: 'CCC', date: '2026-11-01' }
      ]);

      const picks = await ScreenerDiscoverService.getUpcomingEarnings(2);
      expect(picks.map(p => p.symbol)).toEqual(['AAA', 'BBB']);
    });

    test('swallows earnings provider failures', async () => {
      db.query.mockResolvedValueOnce({ rows: [row({ symbol: 'AAA' })] });
      EarningsService.getEarningsForSymbols.mockRejectedValueOnce(new Error('finnhub down'));

      await expect(ScreenerDiscoverService.getUpcomingEarnings(8)).resolves.toEqual([]);
    });
  });

  describe('getDiscoverLists', () => {
    test('assembles all lists plus coverage metadata', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [row({ symbol: 'LOW' })] })                 // lowest P/E
        .mockResolvedValueOnce({ rows: [row({ symbol: 'BIG', pillars_passed: 8 })] }) // most pillars
        .mockResolvedValueOnce({ rows: [row({ symbol: 'ERN' })] })                 // earnings candidates
        .mockResolvedValueOnce({ rows: [{ symbols: '1956', latest: '2026-10-29T11:04:28.000Z' }] });
      EarningsService.getEarningsForSymbols.mockResolvedValueOnce([{ symbol: 'ERN', date: '2026-11-03', hour: 'bmo' }]);

      const data = await ScreenerDiscoverService.getDiscoverLists({ limit: '3' });

      expect(data.lowestPe.map(p => p.symbol)).toEqual(['LOW']);
      expect(data.mostPillars.map(p => p.symbol)).toEqual(['BIG']);
      expect(data.upcomingEarnings.map(p => p.symbol)).toEqual(['ERN']);
      expect(data.meta).toMatchObject({
        analyzedSymbols: 1956,
        latestAnalysisDate: '2026-10-29T11:04:28.000Z',
        calculationVersion: 8,
        hasScanData: true,
        rescanPending: false,
        rescanReason: null,
        earningsWindow: { from: '2026-10-29', to: '2026-11-12' },
        thresholds: { lowestPeMinPillars: 6, mostPillarsMin: 7, earningsMinPillars: 5 }
      });
      // limit is forwarded to each list query
      expect(db.query.mock.calls[0][1]).toContain(3);
      expect(db.query.mock.calls[1][1]).toContain(3);
    });

    test('reports hasScanData=false on an empty install', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ symbols: '0', latest: null }] });
      StockScannerService.needsRescan.mockResolvedValueOnce({ needed: true, reason: 'no_completed_scan' });

      const data = await ScreenerDiscoverService.getDiscoverLists();

      expect(data.meta).toMatchObject({ hasScanData: false, rescanPending: true, rescanReason: 'no_completed_scan' });
      expect(data.lowestPe).toEqual([]);
      expect(data.upcomingEarnings).toEqual([]);
      expect(EarningsService.getEarningsForSymbols).not.toHaveBeenCalled();
    });

    test('treats thin current-formula coverage as no scan data', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [row({ symbol: 'ONE' })] })
        .mockResolvedValueOnce({ rows: [row({ symbol: 'ONE', pillars_passed: 8 })] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ symbols: '5', latest: '2026-10-29T16:21:58.000Z' }] });
      StockScannerService.needsRescan.mockResolvedValueOnce({ needed: true, reason: 'outdated_formula' });

      const data = await ScreenerDiscoverService.getDiscoverLists();

      expect(data.meta).toMatchObject({ analyzedSymbols: 5, hasScanData: false, rescanPending: true, rescanReason: 'outdated_formula' });
      // lists are still returned so nothing is lost if the UI wants them
      expect(data.lowestPe.map(p => p.symbol)).toEqual(['ONE']);
    });

    test('ignores a failing freshness check', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ symbols: '0', latest: null }] });
      StockScannerService.needsRescan.mockRejectedValueOnce(new Error('db down'));
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const data = await ScreenerDiscoverService.getDiscoverLists();
      expect(data.meta.rescanPending).toBe(false);
      warn.mockRestore();
    });
  });
});
