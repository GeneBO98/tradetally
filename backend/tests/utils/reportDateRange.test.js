const { parseReportDateRange } = require('../../src/utils/reportDateRange');

describe('explicit report date boundaries', () => {
  test('retains legacy requests and returns inclusive explicit dates', () => {
    expect(parseReportDateRange({ days: 90 })).toBeNull();
    expect(parseReportDateRange({ start_date: '2024-02-01', end_date: '2024-02-29', period: '1Y' }))
      .toEqual({ start_date: '2024-02-01', end_date: '2024-02-29' });
  });
  test.each([
    { start_date: '2026-08-01' }, { end_date: '2026-08-31' },
    { start_date: '2025-02-29', end_date: '2025-03-01' },
    { start_date: '2026-09-01', end_date: '2026-08-31' },
    { start_date: '2026-08-01T00:00:00Z', end_date: '2026-08-31' },
    { start_date: ['2026-08-01'], end_date: '2026-08-31' }
  ])('rejects malformed, partial, or reversed ranges %j', query => {
    expect(() => parseReportDateRange(query)).toThrow();
    try { parseReportDateRange(query); } catch (error) { expect(error.status).toBe(400); }
  });
});
