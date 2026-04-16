// Verifies the shared CSV escape helper neutralizes Excel/Sheets formula
// triggers and structural characters. Consumed by trade.controller
// exportTradesToCSV and analytics.controller convertToCSV.

const { escapeCsv } = require('../../src/utils/csvEscape');

describe('csvEscape.escapeCsv — formula injection & structural safety', () => {
  test('prefixes values beginning with = with a single quote', () => {
    expect(escapeCsv('=HYPERLINK("https://evil.com","x")'))
      .toMatch(/^['"]'=HYPERLINK/); // may or may not be wrapped, but starts with the ' prefix
  });

  test('prefixes values beginning with + with a single quote', () => {
    expect(escapeCsv('+cmd|calc')).toBe(`'+cmd|calc`);
  });

  test('prefixes values beginning with - with a single quote', () => {
    expect(escapeCsv('-2+5*cmd')).toBe(`'-2+5*cmd`);
  });

  test('prefixes values beginning with @ with a single quote', () => {
    expect(escapeCsv('@SUM(A1:A10)')).toBe(`'@SUM(A1:A10)`);
  });

  test('prefixes tab-leading values', () => {
    expect(escapeCsv('\t=1+1').startsWith(`'\t`)).toBe(true);
  });

  test('prefixes carriage-return-leading values', () => {
    expect(escapeCsv('\r=1+1').startsWith(`'\r`)).toBe(true);
  });

  test('does not prefix normal values', () => {
    expect(escapeCsv('AAPL')).toBe('AAPL');
    expect(escapeCsv('Long trade notes')).toBe('Long trade notes');
    expect(escapeCsv('2025-04-15')).toBe('2025-04-15');
  });

  test('wraps values containing commas, newlines, or quotes in double quotes', () => {
    expect(escapeCsv('a, b')).toBe('"a, b"');
    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsv('she said "hi"')).toBe('"she said ""hi"""');
  });

  test('combines formula prefix and quote wrapping when both triggers apply', () => {
    expect(escapeCsv('=A1,B1')).toBe(`"'=A1,B1"`);
  });

  test('returns empty string for null and undefined', () => {
    expect(escapeCsv(null)).toBe('');
    expect(escapeCsv(undefined)).toBe('');
  });
});
