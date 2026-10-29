jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/eightPillarsService', () => ({
  CALCULATION_VERSION: 8,
  analyzeStock: jest.fn()
}));
jest.mock('../../src/services/fundamentalDataService', () => ({}));
jest.mock('../../src/utils/finnhub', () => ({
  providerName: 'finnhub',
  displayName: 'Finnhub',
  isFinnhub: true
}));
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, writeFileSync: jest.fn(), mkdirSync: jest.fn() };
});

const fs = require('fs');
const db = require('../../src/config/database');
const StockScannerService = require('../../src/services/stockScannerService');

const DAY_MS = 24 * 60 * 60 * 1000;

function holdingsCsv(count) {
  const header = [
    'iShares Russell 2000 ETF',
    'Fund Holdings as of,"Oct 27, 2026"',
    '',
    'Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Quantity,Price,Location,Exchange,Currency,FX Rate,'
  ];
  const rows = [];
  for (let i = 0; i < count; i++) {
    // Generate distinct tickers: AAA, AAB, ...
    const t = String.fromCharCode(65 + Math.floor(i / 676) % 26) +
      String.fromCharCode(65 + Math.floor(i / 26) % 26) +
      String.fromCharCode(65 + (i % 26));
    rows.push(`"${t}","Company ${i}","Industrials","Equity","1,000.00","0.01","1,000.00","10.00","100.00","United States","NYSE","USD","1.00",`);
  }
  rows.push('"XTSLA","BLK CSH FND TREASURY SL AGENCY","Cash and/or Derivatives","Money Market","1.00","0.00","1.00","1.00","1.00","United States","-","USD","1.00",');
  rows.push('"-","USD CASH","Cash and/or Derivatives","Cash","1.00","0.00","1.00","1.00","1.00","United States","-","USD","1.00",');
  return [...header, ...rows].join('\n');
}

const HTML_PAGE = '<!DOCTYPE html>\n<html><head><title>iShares Russell 2000 ETF | IWM</title></head><body>Ticker,Name</body></html>';

function mockFetchResponses(responses) {
  let call = 0;
  global.fetch = jest.fn(async () => {
    const r = responses[Math.min(call, responses.length - 1)];
    call++;
    if (r instanceof Error) throw r;
    return { ok: r.ok !== false, status: r.status || 200, text: async () => r.body };
  });
}

describe('StockScannerService Russell 2000 source', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    StockScannerService.currentScan = null;
  });

  test('parseIsharesHoldingsCsv reads tickers after the header and ignores cash rows', () => {
    const symbols = StockScannerService.parseIsharesHoldingsCsv(holdingsCsv(3));
    expect(symbols).toEqual(['AAA', 'AAB', 'AAC']);
  });

  test('parseIsharesHoldingsCsv returns [] for an HTML page served as CSV', () => {
    expect(StockScannerService.parseIsharesHoldingsCsv(HTML_PAGE)).toEqual([]);
    expect(StockScannerService.parseIsharesHoldingsCsv('')).toEqual([]);
    expect(StockScannerService.parseIsharesHoldingsCsv('no,header,here\nAAPL,x')).toEqual([]);
  });

  test('uses the latest-holdings.csv link first and caches a full list', async () => {
    mockFetchResponses([{ body: holdingsCsv(1200) }]);

    const symbols = await StockScannerService.fetchRussell2000FromIShares();

    expect(symbols).toHaveLength(1200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toMatch(/latest-holdings\.csv$/);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.symbols).toHaveLength(1200);
  });

  test('falls back to the legacy link when the first returns HTML, without touching the cache', async () => {
    mockFetchResponses([{ body: HTML_PAGE }, { body: holdingsCsv(1100) }]);

    const symbols = await StockScannerService.fetchRussell2000FromIShares();

    expect(symbols).toHaveLength(1100);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1); // only for the good response
  });

  test('throws and never overwrites the cache when every source returns junk', async () => {
    mockFetchResponses([{ body: HTML_PAGE }, { body: HTML_PAGE }]);

    await expect(StockScannerService.fetchRussell2000FromIShares()).rejects.toThrow(/iShares fetch failed/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test('treats a short list as failure too', async () => {
    mockFetchResponses([{ body: holdingsCsv(40) }, { ok: false, status: 404, body: '' }]);

    await expect(StockScannerService.fetchRussell2000FromIShares()).rejects.toThrow(/parsed only 40 symbols.*HTTP 404/s);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});

describe('StockScannerService.needsRescan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    StockScannerService.currentScan = null;
  });

  test('is false while a scan is running', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 9 }] });
    await expect(StockScannerService.needsRescan()).resolves.toMatchObject({ needed: false, reason: 'scan_running' });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('is true when no scan has ever completed', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await expect(StockScannerService.needsRescan()).resolves.toMatchObject({ needed: true, reason: 'no_completed_scan' });
  });

  test('is true when the latest scan is older than STALE_AFTER_DAYS', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 4, created_at: new Date(Date.now() - 200 * DAY_MS), rows_total: '1500', rows_current: '1500' }] });
    const result = await StockScannerService.needsRescan();
    expect(result).toMatchObject({ needed: true, reason: 'too_old' });
    expect(result.latestScan.ageDays).toBeGreaterThan(199);
  });

  test('is true when the latest scan was produced by an older formula', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 4, created_at: new Date(Date.now() - 10 * DAY_MS), rows_total: '1500', rows_current: '5' }] });
    await expect(StockScannerService.needsRescan()).resolves.toMatchObject({ needed: true, reason: 'outdated_formula' });
    const params = db.query.mock.calls[1][1];
    expect(params).toEqual([8]);
  });

  test('is false for a recent scan on the current formula', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 4, created_at: new Date(Date.now() - 10 * DAY_MS), rows_total: '1500', rows_current: '1490' }] });
    await expect(StockScannerService.needsRescan()).resolves.toMatchObject({ needed: false, reason: null });
  });
});

describe('StockScannerService.getScanResults version filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    StockScannerService.currentScan = null;
  });

  test('only returns rows from the current calculation version and reports hidden rows', async () => {
    const createdAt = new Date(Date.now() - 20 * DAY_MS);
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 4, scan_date: '2026-10-01', total_stocks: 1941, stocks_analyzed: 1530, status: 'completed', completed_at: createdAt, created_at: createdAt }] }) // latest scan
      .mockResolvedValueOnce({ rows: [] })                                   // running check
      .mockResolvedValueOnce({ rows: [{ total: '1530', current: '5' }] })   // version check
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })                     // count
      .mockResolvedValueOnce({ rows: [] });                                  // results

    const result = await StockScannerService.getScanResults({ page: 1, limit: 50 });

    expect(result.total).toBe(5);
    expect(result.scanInfo).toMatchObject({
      scanId: 4,
      calculationVersion: 8,
      hiddenOutdatedRows: 1525,
      isStale: true,
      staleReason: 'outdated_formula'
    });

    const [countSql, countParams] = db.query.mock.calls[3];
    expect(countSql).toMatch(/WHERE scan_id = \$1 AND calculation_version = \$2/);
    expect(countParams).toEqual([4, 8]);
    const [resultsSql, resultsParams] = db.query.mock.calls[4];
    expect(resultsSql).toMatch(/LIMIT \$3 OFFSET \$4/);
    expect(resultsParams).toEqual([4, 8, 50, 0]);
  });

  test('flags a current-formula scan as stale once it is too old', async () => {
    const createdAt = new Date(Date.now() - 150 * DAY_MS);
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 4, scan_date: '2026-06-01', total_stocks: 10, stocks_analyzed: 10, status: 'completed', completed_at: createdAt, created_at: createdAt }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '10', current: '10' }] })
      .mockResolvedValueOnce({ rows: [{ count: '10' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await StockScannerService.getScanResults({});
    expect(result.scanInfo).toMatchObject({ hiddenOutdatedRows: 0, isStale: true, staleReason: 'too_old' });
  });

  test('pillar filters are appended after the version filter', async () => {
    const createdAt = new Date();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 4, scan_date: '2026-10-01', total_stocks: 10, stocks_analyzed: 10, status: 'completed', completed_at: createdAt, created_at: createdAt }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '10', current: '10' }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await StockScannerService.getScanResults({ pillars: [1, 3] });
    expect(result.scanInfo.isStale).toBe(false);
    const [countSql] = db.query.mock.calls[3];
    expect(countSql).toMatch(/calculation_version = \$2 AND \(pillar_1_pass = true AND pillar_3_pass = true\)/);
  });
});
