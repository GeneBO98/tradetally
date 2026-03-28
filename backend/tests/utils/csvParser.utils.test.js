/**
 * CSV Parser Utility Function Tests
 * Tests pure functions: parseDate, parseDateTime, parseSide, parseNumeric,
 * parseInteger, cleanString, parseInstrumentData
 */

// Mock dependencies that csvParser.js imports at load time
jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn().mockReturnValue(null), set: jest.fn(), del: jest.fn(), data: {} }));
jest.mock('../../src/utils/cusipQueue', () => ({ addToQueue: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({
  convertTradeToUSD: jest.fn(trade => trade),
  userHasProAccess: jest.fn().mockResolvedValue(false)
}));

const {
  parseDate,
  parseDateTime,
  parseSide,
  parseNumeric,
  parseInteger,
  cleanString,
  parseInstrumentData
} = require('../../src/utils/csvParser');

// ──────────────────────────────────────────────
// parseDate
// ──────────────────────────────────────────────
describe('parseDate', () => {
  test('returns null for null/undefined/empty', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('   ')).toBeNull();
  });

  test('parses MM/DD/YYYY format', () => {
    expect(parseDate('07/04/2025')).toBe('2025-07-04');
    expect(parseDate('1/5/2025')).toBe('2025-01-05');
    expect(parseDate('12/31/2024')).toBe('2024-12-31');
  });

  test('parses YYYYMMDD (IBKR Flex) format', () => {
    expect(parseDate('20250704')).toBe('2025-07-04');
    expect(parseDate('20241231')).toBe('2024-12-31');
  });

  test('parses YYYYMMDD;HHMMSS (IBKR Flex with time) format', () => {
    expect(parseDate('20250704;093000')).toBe('2025-07-04');
  });

  test('parses XX-XX-YY format (DD-MM-YY / MM-DD-YY)', () => {
    // When first > 12, must be DD-MM-YY
    expect(parseDate('25-01-24')).toBe('2024-01-25');
    // When second > 12, must be MM-DD-YY
    expect(parseDate('01-25-24')).toBe('2024-01-25');
    // Ambiguous defaults to DD-MM-YY
    expect(parseDate('05-06-24')).toBe('2024-06-05');
  });

  test('parses MM/DD/YY format', () => {
    expect(parseDate('07/04/25')).toBe('2025-07-04');
  });

  test('strips surrounding quotes', () => {
    expect(parseDate('"07/04/2025"')).toBe('2025-07-04');
    expect(parseDate("'12/31/2024'")).toBe('2024-12-31');
  });

  test('returns null for invalid dates', () => {
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate('13/40/2025')).toBeNull(); // invalid month/day
    expect(parseDate('02/30/2025')).toBeNull(); // Feb 30 doesn't exist
  });

  test('returns null for out-of-range years', () => {
    expect(parseDate('01/01/1800')).toBeNull();
  });

  test('handles numeric input', () => {
    const result = parseDate(20250704);
    // Should convert number to string and parse
    expect(result).toBe('2025-07-04');
  });

  test('parses month name dates when the time is glued to the year', () => {
    expect(parseDate('February 23, 202607:11 PM')).toBe('2026-02-23');
  });
});

// ──────────────────────────────────────────────
// parseDateTime
// ──────────────────────────────────────────────
describe('parseDateTime', () => {
  test('returns null for null/undefined/empty', () => {
    expect(parseDateTime(null)).toBeNull();
    expect(parseDateTime(undefined)).toBeNull();
    expect(parseDateTime('')).toBeNull();
    expect(parseDateTime('   ')).toBeNull();
  });

  test('parses MM/DD/YYYY HH:MM:SS format', () => {
    expect(parseDateTime('07/04/2025 09:30:00')).toBe('2025-07-04T09:30:00');
    expect(parseDateTime('1/5/2025 14:05:30')).toBe('2025-01-05T14:05:30');
  });

  test('parses MM/DD/YYYY HH:MM format (no seconds)', () => {
    expect(parseDateTime('07/04/2025 09:30')).toBe('2025-07-04T09:30:00');
  });

  test('parses MM/DD/YYYY HH:MM:SS +TZ format (ProjectX)', () => {
    expect(parseDateTime('07/04/2025 09:30:00 +05:00')).toBe('2025-07-04T09:30:00+05:00');
  });

  test('parses IBKR Flex YYYYMMDD;HHMMSS format', () => {
    expect(parseDateTime('20250704;093015')).toBe('2025-07-04T09:30:15');
  });

  test('parses MM/DD/YY;HHMMSS format (IBKR Flex slash)', () => {
    expect(parseDateTime('07/04/25;093015')).toBe('2025-07-04T09:30:15');
  });

  test('parses XX-XX-YY HH:MM format (IBKR Activity Statement)', () => {
    // When second > 12, it's MM-DD-YY
    expect(parseDateTime('01-25-24 9:30')).toBe('2024-01-25T09:30:00');
    // Ambiguous defaults to DD-MM-YY
    expect(parseDateTime('05-06-24 14:30')).toBe('2024-06-05T14:30:00');
  });

  test('parses YYYY-MM-DD HH:MM:SS (local datetime)', () => {
    expect(parseDateTime('2025-07-04 09:30:00')).toBe('2025-07-04T09:30:00');
  });

  test('parses date-only MM/DD/YYYY (defaults to 09:30)', () => {
    expect(parseDateTime('07/04/2025')).toBe('2025-07-04T09:30:00');
  });

  test('strips surrounding quotes', () => {
    expect(parseDateTime('"07/04/2025 09:30:00"')).toBe('2025-07-04T09:30:00');
  });

  test('returns null for invalid datetimes', () => {
    expect(parseDateTime('not-a-datetime')).toBeNull();
  });

  test('returns null for out-of-range IBKR dates', () => {
    // Month 13 is invalid
    expect(parseDateTime('20251304;093015')).toBeNull();
  });

  test('parses month name datetimes with AM/PM when the time is glued to the year', () => {
    expect(parseDateTime('February 23, 202607:11 PM')).toBe('2026-02-23T19:11:00');
  });
});

// ──────────────────────────────────────────────
// parseSide
// ──────────────────────────────────────────────
describe('parseSide', () => {
  test('returns "long" for null/undefined', () => {
    expect(parseSide(null)).toBe('long');
    expect(parseSide(undefined)).toBe('long');
  });

  test('returns "short" for sell-like strings', () => {
    expect(parseSide('sell')).toBe('short');
    expect(parseSide('SELL')).toBe('short');
    expect(parseSide('short')).toBe('short');
    expect(parseSide('Short Sell')).toBe('short');
  });

  test('returns "long" for buy-like strings', () => {
    expect(parseSide('buy')).toBe('long');
    expect(parseSide('BUY')).toBe('long');
    expect(parseSide('long')).toBe('long');
    expect(parseSide('Long Buy')).toBe('long');
  });

  test('returns "long" for unrecognized strings', () => {
    expect(parseSide('unknown')).toBe('long');
  });
});

// ──────────────────────────────────────────────
// parseNumeric
// ──────────────────────────────────────────────
describe('parseNumeric', () => {
  test('returns default for null/undefined/empty', () => {
    expect(parseNumeric(null)).toBe(0);
    expect(parseNumeric(undefined)).toBe(0);
    expect(parseNumeric('')).toBe(0);
  });

  test('parses plain numbers', () => {
    expect(parseNumeric('123.45')).toBe(123.45);
    expect(parseNumeric('-50.25')).toBe(-50.25);
    expect(parseNumeric(42)).toBe(42);
  });

  test('strips currency symbols and commas', () => {
    expect(parseNumeric('$1,234.56')).toBe(1234.56);
    expect(parseNumeric('$-500.00')).toBe(-500);
  });

  test('handles accounting-style negatives (parentheses)', () => {
    expect(parseNumeric('(123.45)')).toBe(-123.45);
    expect(parseNumeric('($1,000.00)')).toBe(-1000);
  });

  test('returns default for non-numeric strings', () => {
    expect(parseNumeric('abc')).toBe(0);
    expect(parseNumeric('N/A', 99)).toBe(99);
  });

  test('returns default for overflow values', () => {
    expect(parseNumeric('9999999999999999')).toBe(0);
  });

  test('returns default for Infinity', () => {
    expect(parseNumeric('Infinity')).toBe(0);
  });

  test('uses custom default value', () => {
    expect(parseNumeric(null, -1)).toBe(-1);
    expect(parseNumeric('abc', 42)).toBe(42);
  });
});

// ──────────────────────────────────────────────
// parseInteger
// ──────────────────────────────────────────────
describe('parseInteger', () => {
  test('returns default for null/undefined/empty', () => {
    expect(parseInteger(null)).toBe(0);
    expect(parseInteger(undefined)).toBe(0);
    expect(parseInteger('')).toBe(0);
  });

  test('parses integers and returns absolute value', () => {
    expect(parseInteger('100')).toBe(100);
    expect(parseInteger('-50')).toBe(50); // abs
    expect(parseInteger('1,000')).toBe(1000);
  });

  test('truncates decimals', () => {
    expect(parseInteger('99.9')).toBe(99);
  });

  test('returns default for non-numeric', () => {
    expect(parseInteger('abc')).toBe(0);
    expect(parseInteger('N/A', 5)).toBe(5);
  });

  test('returns default for int32 overflow', () => {
    expect(parseInteger('3000000000')).toBe(0);
    expect(parseInteger('-3000000000')).toBe(0);
  });

  test('uses custom default', () => {
    expect(parseInteger(null, 10)).toBe(10);
  });
});

// ──────────────────────────────────────────────
// cleanString
// ──────────────────────────────────────────────
describe('cleanString', () => {
  test('returns empty string for null/undefined', () => {
    expect(cleanString(null)).toBe('');
    expect(cleanString(undefined)).toBe('');
  });

  test('trims whitespace', () => {
    expect(cleanString('  hello  ')).toBe('hello');
  });

  test('converts numbers to string', () => {
    expect(cleanString(42)).toBe('42');
  });

  test('handles empty string', () => {
    expect(cleanString('')).toBe('');
  });
});

// ──────────────────────────────────────────────
// parseInstrumentData
// ──────────────────────────────────────────────
describe('parseInstrumentData', () => {
  test('returns stock for null/undefined', () => {
    expect(parseInstrumentData(null)).toEqual({ instrumentType: 'stock' });
    expect(parseInstrumentData(undefined)).toEqual({ instrumentType: 'stock' });
  });

  test('returns stock for plain ticker', () => {
    expect(parseInstrumentData('AAPL')).toEqual({ instrumentType: 'stock' });
    expect(parseInstrumentData('MSFT')).toEqual({ instrumentType: 'stock' });
  });

  test('detects IBKR readable options format: "DIA 10OCT25 466 PUT"', () => {
    const result = parseInstrumentData('DIA 10OCT25 466 PUT');
    expect(result.instrumentType).toBe('option');
    expect(result.underlyingSymbol).toBe('DIA');
    expect(result.strikePrice).toBe(466);
    expect(result.optionType).toBe('put');
    expect(result.expirationDate).toBe('2025-10-10');
  });

  test('detects IBKR compact options: "SEDG  250801P00025000"', () => {
    const result = parseInstrumentData('SEDG  250801P00025000');
    expect(result.instrumentType).toBe('option');
    expect(result.underlyingSymbol).toBe('SEDG');
    expect(result.strikePrice).toBe(25);
    expect(result.optionType).toBe('put');
  });

  test('detects OCC-style options: "AAPL230120C00150000"', () => {
    const result = parseInstrumentData('AAPL230120C00150000');
    expect(result.instrumentType).toBe('option');
    expect(result.underlyingSymbol).toBe('AAPL');
    expect(result.strikePrice).toBe(150);
    expect(result.optionType).toBe('call');
    expect(result.expirationDate).toBe('2023-01-20');
  });

  test('detects standard futures: "ESM4"', () => {
    const result = parseInstrumentData('ESM4');
    expect(result.instrumentType).toBe('future');
    expect(result.underlyingAsset).toBe('ES');
  });

  test('detects two-digit year futures: "NQU24"', () => {
    const result = parseInstrumentData('NQU24');
    expect(result.instrumentType).toBe('future');
    expect(result.underlyingAsset).toBe('NQ');
  });

  test('detects slash-notation futures: "/ESM24"', () => {
    const result = parseInstrumentData('/ESM24');
    expect(result.instrumentType).toBe('future');
    expect(result.underlyingAsset).toBe('ES');
  });

  test('detects compact readable options: "DIA10OCT25466PUT"', () => {
    const result = parseInstrumentData('DIA10OCT25466PUT');
    expect(result.instrumentType).toBe('option');
    expect(result.underlyingSymbol).toBe('DIA');
    expect(result.strikePrice).toBe(466);
    expect(result.optionType).toBe('put');
  });
});
