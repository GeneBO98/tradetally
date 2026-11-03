const { parseTradeFilters } = require('../../src/utils/tradeFilters');

describe('parseTradeFilters date params', () => {
  it('maps non-ASCII decimal digits to ASCII', () => {
    const filters = parseTradeFilters(
      { startDate: '٢٠٢٦-١٠-١٩', endDate: '۲۰۲۶-۱۰-۲۱' },
      { fields: ['startDate', 'endDate'] }
    );
    expect(filters).toEqual({ startDate: '2026-10-19', endDate: '2026-10-21' });
  });

  it('keeps ISO timestamps and empty values unchanged', () => {
    expect(parseTradeFilters({ startDate: '2026-10-19T00:00:00Z' }, { fields: ['startDate'] }))
      .toEqual({ startDate: '2026-10-19T00:00:00Z' });
    expect(parseTradeFilters({}, { fields: ['startDate', 'exitEndDate'] }))
      .toEqual({ startDate: undefined, exitEndDate: undefined });
  });

  it('rejects unparseable dates as a ValidationError (400) instead of a Postgres 500', () => {
    expect(() => parseTradeFilters({ startDate: 'garbage' }, { fields: ['startDate'] }))
      .toThrow(expect.objectContaining({ name: 'ValidationError' }));
  });
});
