jest.mock('../../src/services/tax/taxReportService', () => ({ generate: jest.fn() }));
jest.mock('../../src/utils/displayCurrency', () => ({
  convertForDisplay: jest.fn(async (req, payload) => ({ ...payload, display_currency: 'USD' }))
}));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), logError: jest.fn() }));

const TaxReportService = require('../../src/services/tax/taxReportService');
const controller = require('../../src/controllers/taxReport.controller');

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
    send(body) { this.payload = body; return this; },
    setHeader(name, value) { this.headers[name] = value; }
  };
}

const row = (overrides = {}) => ({
  description: '10 sh AAPL', symbol: 'AAPL', account: null, dateAcquired: '2025-01-02', dateSold: '2025-01-03',
  proceeds: 110, costBasis: 100, adjustmentCode: '', adjustmentAmount: 0, gainLoss: 10, term: 'short', ...overrides
});

describe('taxReport controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TaxReportService.generate.mockResolvedValue({
      year: 2025,
      availableYears: [2025],
      summary: {},
      excluded: {},
      rows: [row(), row({ term: 'long' }), row({ adjustmentCode: 'W', adjustmentAmount: 5 })]
    });
  });

  it('returns a page of rows with the total', async () => {
    const res = createResponse();

    await controller.getReport({ user: { id: 'u1' }, query: { year: '2025', accounts: 'A, B', pageSize: '2' } }, res, jest.fn());

    expect(TaxReportService.generate).toHaveBeenCalledWith('u1', { year: 2025, accounts: ['A', 'B'] });
    expect(res.payload.rows).toHaveLength(2);
    expect(res.payload.pagination).toEqual({ page: 1, pageSize: 2, totalRows: 3, totalPages: 2 });
    expect(res.payload.display_currency).toBe('USD');
  });

  it('filters rows by term and by wash sale', async () => {
    const longOnly = createResponse();
    await controller.getReport({ user: { id: 'u1' }, query: { year: '2025', term: 'long' } }, longOnly, jest.fn());
    expect(longOnly.payload.rows.map((r) => r.term)).toEqual(['long']);

    const washOnly = createResponse();
    await controller.getReport({ user: { id: 'u1' }, query: { year: '2025', washOnly: 'true' } }, washOnly, jest.fn());
    expect(washOnly.payload.pagination.totalRows).toBe(1);
  });

  it('lets the service pick the year when none is given and rejects a bad one', async () => {
    const res = createResponse();
    await controller.getReport({ user: { id: 'u1' }, query: {} }, res, jest.fn());
    expect(TaxReportService.generate).toHaveBeenCalledWith('u1', { year: null, accounts: null });

    const bad = createResponse();
    await controller.getReport({ user: { id: 'u1' }, query: { year: 'abc' } }, bad, jest.fn());
    expect(bad.statusCode).toBe(400);
  });

  it('exports CSV and TXF as attachments', async () => {
    const csv = createResponse();
    await controller.exportReport({ user: { id: 'u1' }, query: { year: '2025' } }, csv, jest.fn());
    expect(csv.headers['Content-Disposition']).toBe('attachment; filename="tradetally-form-8949-2025.csv"');
    expect(csv.payload.split('\r\n')[1]).toContain('10 sh AAPL');

    const txf = createResponse();
    await controller.exportReport({ user: { id: 'u1' }, query: { year: '2025', format: 'txf', box: 'c' } }, txf, jest.fn());
    expect(txf.headers['Content-Disposition']).toContain('.txf');
    expect(txf.payload.startsWith('V042')).toBe(true);
    expect(txf.payload).toContain('N712');
  });

  it('validates export parameters', async () => {
    for (const query of [{}, { year: '2025', format: 'pdf' }, { year: '2025', box: 'Z' }]) {
      const res = createResponse();
      await controller.exportReport({ user: { id: 'u1' }, query }, res, jest.fn());
      expect(res.statusCode).toBe(400);
    }
    expect(TaxReportService.generate).not.toHaveBeenCalled();
  });
});
