const { schemas } = require('../../src/middleware/validation');

// Date-only fields (DATE columns) must survive validation as plain strings.
// Joi.date() converts them to UTC-midnight Date objects, which pg serializes
// in the server's LOCAL timezone — on servers west of UTC the stored DATE
// lands one day early. Issue #349: editing an option's expiration date to
// Jun 12 saved Jun 11.
describe('date-only fields stay strings through validation', () => {
  test('updateTrade keeps expirationDate as the original string', () => {
    const { error, value } = schemas.updateTrade.validate({ expirationDate: '2026-06-12' });

    expect(error).toBeUndefined();
    expect(value.expirationDate).toBe('2026-06-12');
  });

  test('createTrade keeps expirationDate as the original string', () => {
    const { error, value } = schemas.createTrade.validate({
      symbol: 'AAPL',
      entryTime: '2026-06-10T10:00:00Z',
      entryPrice: 1,
      quantity: 1,
      side: 'long',
      expirationDate: '2026-06-12'
    });

    expect(error).toBeUndefined();
    expect(value.expirationDate).toBe('2026-06-12');
  });

  test('createShellTrade keeps expirationDate as the original string', () => {
    const { error, value } = schemas.createShellTrade.validate({
      symbol: 'AAPL',
      side: 'long',
      expirationDate: '2026-06-12'
    });

    expect(error).toBeUndefined();
    expect(value.expirationDate).toBe('2026-06-12');
  });

  test('diary entryDate stays a string', () => {
    const { error, value } = schemas.createDiaryEntry.validate({ entryDate: '2026-06-12' });

    expect(error).toBeUndefined();
    expect(value.entryDate).toBe('2026-06-12');
  });

  test('expirationDate still allows null and empty string', () => {
    expect(schemas.updateTrade.validate({ expirationDate: null }).error).toBeUndefined();
    expect(schemas.updateTrade.validate({ expirationDate: '' }).error).toBeUndefined();
  });

  test('invalid expirationDate is still rejected', () => {
    expect(schemas.updateTrade.validate({ expirationDate: 'not-a-date' }).error).toBeDefined();
  });

  test('entryTime is still converted to a Date (timestamptz column)', () => {
    const { error, value } = schemas.updateTrade.validate({ entryTime: '2026-06-10T10:00:00Z' });

    expect(error).toBeUndefined();
    expect(value.entryTime).toBeInstanceOf(Date);
  });
});
